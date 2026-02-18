import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Primitive = string | number | boolean | null | undefined;

type FixtureEntry = {
  id?: Primitive;
  timestamp?: Primitive;
  level?: Primitive;
  event?: Primitive;
  data?: Record<string, unknown>;
  [key: string]: unknown;
};

type FixturePayload = {
  entries: FixtureEntry[];
};

type StartedServer = {
  origin: string;
  close: () => Promise<void>;
};

type FixtureApiServer = StartedServer & {
  requests: URL[];
};

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..", "..");

function toText(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value);
}

function toInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(toText(value), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function byPath(input: unknown, path: string): unknown {
  if (!input || typeof input !== "object") return undefined;
  const keys = path.split(".");
  let cursor: unknown = input;
  for (const key of keys) {
    if (!cursor || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return cursor;
}

function getFieldValue(entry: FixtureEntry, field: string): unknown {
  const normalized = toText(field).trim();
  if (!normalized) return undefined;
  if (normalized.includes(".")) {
    const nested = byPath(entry, normalized);
    if (nested !== undefined) return nested;
    return byPath(entry.data, normalized);
  }

  if (entry[normalized] !== undefined) return entry[normalized];
  if (entry.data && typeof entry.data === "object") {
    return (entry.data as Record<string, unknown>)[normalized];
  }
  return undefined;
}

function entryTimestampMs(entry: FixtureEntry): number {
  const direct = Date.parse(toText(entry.timestamp));
  if (Number.isFinite(direct)) return direct;
  const dataTs = Date.parse(toText(getFieldValue(entry, "timestamp")));
  return Number.isFinite(dataTs) ? dataTs : Number.NaN;
}

function parseCursor(cursor: string | null): number {
  if (!cursor) return 0;
  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    const offset = Number(decoded?.offset);
    if (!Number.isFinite(offset) || offset < 0) return 0;
    return Math.floor(offset);
  } catch {
    return 0;
  }
}

function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ offset }), "utf8").toString("base64url");
}

function applyFilters(entries: FixtureEntry[], params: URLSearchParams): FixtureEntry[] {
  const from = toText(params.get("from")).trim();
  const to = toText(params.get("to")).trim();
  const level = toText(params.get("level")).trim().toUpperCase();
  const audit = toText(params.get("audit")).trim().toLowerCase();
  const field = toText(params.get("field")).trim();
  const value = toText(params.get("value")).trim().toLowerCase();

  const fromMs = from ? Date.parse(from) : Number.NaN;
  const toMs = to ? Date.parse(to) : Number.NaN;

  return entries.filter((entry) => {
    const ts = entryTimestampMs(entry);
    if (Number.isFinite(fromMs) && Number.isFinite(ts) && ts < fromMs) return false;
    if (Number.isFinite(toMs) && Number.isFinite(ts) && ts > toMs) return false;

    if (level && toText(entry.level).trim().toUpperCase() !== level) return false;

    if (audit === "true" || audit === "false") {
      const auditValue = String(Boolean(getFieldValue(entry, "audit")));
      if (auditValue !== audit) return false;
    }

    if (field && value) {
      const candidate = getFieldValue(entry, field);
      if (!toText(candidate).toLowerCase().includes(value)) return false;
    }

    return true;
  });
}

function aggregateBuckets(
  entries: FixtureEntry[],
  groupBy: string,
  groupField: string,
  limit: number,
): Array<{ key: string; count: number }> {
  const counts = new Map<string, number>();

  for (const entry of entries) {
    let key = "";
    if (groupBy === "level") {
      key = toText(entry.level).trim();
    } else if (groupBy === "event") {
      key = toText(entry.event).trim();
    } else if (groupBy === "field") {
      key = toText(getFieldValue(entry, groupField)).trim();
    } else if (groupBy === "correlation") {
      key = toText(getFieldValue(entry, "correlationId")).trim();
      if (!key) {
        key = toText(getFieldValue(entry, "requestId")).trim();
      }
    }

    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      return left.key.localeCompare(right.key);
    })
    .slice(0, limit);
}

function jsonResponse(res: ServerResponse, statusCode: number, payload: unknown) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
  res.end(JSON.stringify(payload));
}

function notFound(res: ServerResponse) {
  jsonResponse(res, 404, { error: "Not found" });
}

async function startServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>,
  port = 0,
): Promise<StartedServer & { port: number }> {
  const server = createServer((req, res) => {
    void Promise.resolve(handler(req, res)).catch((error) => {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: String(error) }));
    });
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not resolve server address.");
  }

  return {
    origin: `http://127.0.0.1:${address.port}`,
    port: address.port,
    close: () =>
      new Promise<void>((resolveClose, rejectClose) => {
        server.close((error) => (error ? rejectClose(error) : resolveClose()));
      }),
  };
}

export async function loadFixture(
  fixturePath = "tests/fixtures/logs.fixture.json",
): Promise<FixturePayload> {
  const absolute = isAbsolute(fixturePath) ? fixturePath : resolve(projectRoot, fixturePath);
  const raw = JSON.parse(await readFile(absolute, "utf8"));
  const entries = Array.isArray(raw?.entries) ? raw.entries : [];
  return { entries };
}

export async function startFixtureApiServer(
  fixture: FixturePayload,
  port = 0,
): Promise<FixtureApiServer> {
  const requests: URL[] = [];
  const entries = fixture.entries;

  const started = await startServer((req, res) => {
    if (req.method === "OPTIONS") {
      jsonResponse(res, 204, {});
      return;
    }
    if (req.method !== "GET") {
      jsonResponse(res, 405, { error: "Method not allowed" });
      return;
    }

    const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
    requests.push(url);

    if (url.pathname === "/api/logs") {
      const filtered = applyFilters(entries, url.searchParams);
      const limit = clamp(toInt(url.searchParams.get("limit"), 1000), 1, 1000);
      const offset = parseCursor(url.searchParams.get("cursor"));
      const pageEntries = filtered.slice(offset, offset + limit);
      const nextOffset = offset + pageEntries.length;
      const hasMore = nextOffset < filtered.length;
      jsonResponse(res, 200, {
        entries: pageEntries,
        hasMore,
        limit,
        nextCursor: hasMore ? encodeCursor(nextOffset) : null,
      });
      return;
    }

    if (url.pathname === "/api/logs/aggregate") {
      const filtered = applyFilters(entries, url.searchParams);
      const groupBy = toText(url.searchParams.get("groupBy")).trim();
      const groupField = toText(url.searchParams.get("groupField")).trim();
      const limit = clamp(toInt(url.searchParams.get("limit"), 10), 1, 200);
      const buckets = aggregateBuckets(filtered, groupBy, groupField, limit);
      jsonResponse(res, 200, { buckets, groupBy });
      return;
    }

    notFound(res);
  }, port);

  return {
    origin: started.origin,
    close: started.close,
    requests,
  };
}

export async function startConfigServer(apiOrigin: string, port = 0): Promise<StartedServer> {
  const started = await startServer((req, res) => {
    if (req.method !== "GET") {
      jsonResponse(res, 405, { error: "Method not allowed" });
      return;
    }
    const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
    if (url.pathname === "/config.json") {
      jsonResponse(res, 200, { apiOrigin });
      return;
    }
    if (url.pathname === "/" || url.pathname === "/index.html") {
      res.statusCode = 200;
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end("<!doctype html><html><body>fixture config server</body></html>");
      return;
    }
    notFound(res);
  }, port);

  return {
    origin: started.origin,
    close: started.close,
  };
}
