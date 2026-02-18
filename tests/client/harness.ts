import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..", "..");
const indexHtml = readFileSync(resolve(projectRoot, "src/index.html"), "utf8");
const bodyMatch = indexHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
const bodyHtml = bodyMatch ? bodyMatch[1] : indexHtml;
const sanitizedBodyHtml = bodyHtml.replace(/<script[\s\S]*?<\/script>/gi, "");

export function mountAppShell(origin: string) {
  if ("happyDOM" in window && typeof window.happyDOM?.setURL === "function") {
    window.happyDOM.setURL(`${origin}/`);
  }

  document.body.innerHTML = sanitizedBodyHtml;
  document.documentElement.dataset.theme = "light";
}

export async function waitForCondition(
  predicate: () => boolean,
  options: { timeoutMs?: number; intervalMs?: number; message?: string } = {},
) {
  const timeoutMs = options.timeoutMs ?? 5000;
  const intervalMs = options.intervalMs ?? 25;
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    if (predicate()) return;
    await new Promise((resolveSleep) => {
      window.setTimeout(resolveSleep, intervalMs);
    });
  }
  throw new Error(options.message || "Timed out waiting for condition.");
}

export async function waitForLoadedStatus() {
  await waitForCondition(
    () => {
      const status = document.getElementById("status-line");
      if (!(status instanceof HTMLElement)) return false;
      return /Loaded \d+ log entries/.test(status.textContent || "");
    },
    { timeoutMs: 10_000, message: "Timed out waiting for loaded status." },
  );
}

export function dispatchShortcut(key: string) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true });
  window.dispatchEvent(event);
}
