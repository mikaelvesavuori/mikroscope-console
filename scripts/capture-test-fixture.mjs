#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const apiOrigin = process.env.MIKROSCOPE_API_ORIGIN || "http://127.0.0.1:4310";
const pageLimit = Math.max(1, Number.parseInt(process.env.MIKROSCOPE_PAGE_LIMIT || "500", 10));
const targetCount = Math.max(
  100,
  Number.parseInt(process.env.MIKROSCOPE_TARGET_ENTRIES || "2000", 10),
);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const outputPath = path.resolve(
  projectRoot,
  process.env.MIKROSCOPE_FIXTURE_PATH || "tests/fixtures/logs.fixture.json",
);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeId(entry, fallbackIndex) {
  if (entry && typeof entry === "object" && "id" in entry) {
    return String(entry.id);
  }
  return `unknown-${fallbackIndex}`;
}

async function fetchPage(cursor = "") {
  const params = new URLSearchParams();
  params.set("limit", String(pageLimit));
  if (cursor) {
    params.set("cursor", cursor);
  }
  const url = `${apiOrigin}/api/logs?${params.toString()}`;
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch fixture page (${response.status}): ${text}`);
  }
  return response.json();
}

async function capture() {
  let cursor = "";
  let hasMore = true;
  const pages = [];
  while (hasMore && pages.length < 1000) {
    const payload = await fetchPage(cursor);
    const entries = asArray(payload?.entries);
    if (entries.length === 0) break;
    pages.push(...entries);
    hasMore = Boolean(payload?.hasMore);
    cursor = typeof payload?.nextCursor === "string" ? payload.nextCursor : "";
    if (!cursor) hasMore = false;
    if (pages.length >= targetCount) break;
  }

  const seen = new Set();
  const deduped = [];
  for (let index = 0; index < pages.length; index++) {
    const entry = pages[index];
    const id = normalizeId(entry, index);
    if (seen.has(id)) continue;
    seen.add(id);
    deduped.push(entry);
    if (deduped.length >= targetCount) break;
  }

  const output = {
    capturedAt: new Date().toISOString(),
    sourceApiOrigin: apiOrigin,
    count: deduped.length,
    entries: deduped,
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  process.stdout.write(
    `Wrote ${deduped.length} entries to ${outputPath} (source: ${apiOrigin}).\n`,
  );
}

capture().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
