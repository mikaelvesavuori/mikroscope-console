import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { dispatchShortcut, mountAppShell, waitForCondition, waitForLoadedStatus } from "./harness";
import { loadFixture, startConfigServer, startFixtureApiServer } from "./fixture-servers";

type FixtureApiServer = Awaited<ReturnType<typeof startFixtureApiServer>>;

describe.sequential("MikroScope Console Integration", () => {
  let apiServer: FixtureApiServer;
  let configServer: { close: () => Promise<void>; origin: string };

  async function waitForApiQuiet(idleMs = 160, timeoutMs = 4000) {
    const startedAt = Date.now();
    let lastCount = apiServer.requests.length;
    let idleStartedAt = Date.now();
    while (Date.now() - startedAt <= timeoutMs) {
      await new Promise((resolveDelay) => {
        window.setTimeout(resolveDelay, 30);
      });
      const currentCount = apiServer.requests.length;
      if (currentCount !== lastCount) {
        lastCount = currentCount;
        idleStartedAt = Date.now();
        continue;
      }
      if (Date.now() - idleStartedAt >= idleMs) {
        return;
      }
    }
  }

  async function resetToBaseline() {
    const resetButton = document.getElementById("reset-baseline-button");
    expect(resetButton).toBeInstanceOf(HTMLButtonElement);
    (resetButton as HTMLButtonElement).click();
    await waitForLoadedStatus();
    await waitForApiQuiet();
  }

  function getStatusText() {
    const status = document.getElementById("status-line");
    return status instanceof HTMLElement ? status.textContent || "" : "";
  }

  function getLatestLogsRequest(withoutCursor = true) {
    const list = [...apiServer.requests].reverse();
    return list.find(
      (item) =>
        item.pathname === "/api/logs" && (withoutCursor ? !item.searchParams.has("cursor") : true),
    );
  }

  beforeAll(async () => {
    const fixture = await loadFixture();
    apiServer = await startFixtureApiServer(fixture);
    configServer = await startConfigServer(apiServer.origin);
    mountAppShell(configServer.origin);
    await import("../../src/app.js");
    await waitForLoadedStatus();
    await waitForApiQuiet();
  });

  afterAll(async () => {
    await new Promise((resolveDelay) => {
      window.setTimeout(resolveDelay, 300);
    });
    if ("happyDOM" in window && typeof window.happyDOM?.abort === "function") {
      window.happyDOM.abort();
    }
    await Promise.all([apiServer.close(), configServer.close()]);
  });

  test("boots with data and date/time controls", () => {
    const from = document.getElementById("query-from");
    const fromTime = document.getElementById("query-from-time");
    const to = document.getElementById("query-to");
    const toTime = document.getElementById("query-to-time");
    const metricLoaded = document.getElementById("metric-loaded");
    const rows = document.querySelectorAll("#logs-tbody tr.row-main");

    expect(from).toBeInstanceOf(HTMLInputElement);
    expect((from as HTMLInputElement).type).toBe("date");
    expect(fromTime).toBeInstanceOf(HTMLInputElement);
    expect((fromTime as HTMLInputElement).type).toBe("time");
    expect(to).toBeInstanceOf(HTMLInputElement);
    expect((to as HTMLInputElement).type).toBe("date");
    expect(toTime).toBeInstanceOf(HTMLInputElement);
    expect((toTime as HTMLInputElement).type).toBe("time");

    expect(metricLoaded).toBeInstanceOf(HTMLElement);
    expect(Number.parseInt((metricLoaded as HTMLElement).textContent || "0", 10)).toBeGreaterThan(0);
    expect(rows.length).toBeGreaterThan(0);
    expect(getStatusText()).toMatch(/Loaded \d+ log entries/);
  });

  test("serializes custom date/time into server query and URL", async () => {
    await resetToBaseline();

    const from = document.getElementById("query-from") as HTMLInputElement;
    const fromTime = document.getElementById("query-from-time") as HTMLInputElement;
    const to = document.getElementById("query-to") as HTMLInputElement;
    const toTime = document.getElementById("query-to-time") as HTMLInputElement;
    const runButton = document.getElementById("refresh-button") as HTMLButtonElement;

    from.value = "2026-02-17";
    from.dispatchEvent(new Event("change", { bubbles: true }));
    fromTime.value = "08:15:30";
    fromTime.dispatchEvent(new Event("change", { bubbles: true }));

    to.value = "2026-02-18";
    to.dispatchEvent(new Event("change", { bubbles: true }));
    toTime.value = "09:45:45";
    toTime.dispatchEvent(new Event("change", { bubbles: true }));

    runButton.click();
    await waitForLoadedStatus();
    await waitForApiQuiet();

    const logsRequest = getLatestLogsRequest(true);
    expect(logsRequest).toBeDefined();
    const fromParam = logsRequest?.searchParams.get("from") || "";
    const toParam = logsRequest?.searchParams.get("to") || "";
    expect(fromParam).toMatch(/T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
    expect(toParam).toMatch(/T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
    expect(new Date(fromParam).getUTCSeconds()).toBe(30);
    expect(new Date(toParam).getUTCSeconds()).toBe(45);

    expect(window.location.search).toContain("from=");
    expect(window.location.search).toContain("to=");
  });

  test("space toggles expanded stream modal open/close without clearing scope", async () => {
    await resetToBaseline();

    const firstCorrelation = document.querySelector("#logs-tbody .correlation-link");
    expect(firstCorrelation).toBeInstanceOf(HTMLButtonElement);
    (firstCorrelation as HTMLButtonElement).click();
    await waitForLoadedStatus();
    await waitForApiQuiet();

    const queryValue = document.getElementById("query-value") as HTMLInputElement;
    const scopedValue = queryValue.value;
    expect(scopedValue.length).toBeGreaterThan(0);

    dispatchShortcut(" ");
    const modal = document.getElementById("stream-modal") as HTMLDialogElement;
    await waitForCondition(() => modal.open, { message: "Expected stream modal to be open." });

    const clearButton = document.getElementById("stream-modal-clear-button") as HTMLButtonElement;
    clearButton.focus();
    dispatchShortcut(" ");
    await waitForCondition(() => !modal.open, { message: "Expected stream modal to close." });
    expect(queryValue.value).toBe(scopedValue);
  });

  test("copies current view path with U shortcut", async () => {
    dispatchShortcut("u");
    await waitForCondition(() => getStatusText().includes("Copied current view URL path."), {
      message: "Expected copy view URL status message.",
    });
    const copied = await navigator.clipboard.readText();
    expect(copied).toContain(window.location.pathname);
    expect(copied).toContain("field=");
    expect(copied).toContain("value=");
  });

  test("timeline drilldown returns to stream and shows timeline scope chip", async () => {
    await resetToBaseline();

    const timelineTab = document.querySelector('.view-tab[data-view-target="timeline"]');
    expect(timelineTab).toBeInstanceOf(HTMLButtonElement);
    (timelineTab as HTMLButtonElement).click();

    await waitForCondition(
      () =>
        Boolean(
          document.querySelector(
            '#timeline .timeline-bar[data-count]:not([data-count="0"])',
          ) as HTMLButtonElement | null,
        ),
      { timeoutMs: 10_000, message: "Expected timeline bars to render." },
    );

    const drilldownTarget = document.querySelector(
      '#timeline .timeline-bar[data-count]:not([data-count="0"])',
    ) as HTMLButtonElement;
    drilldownTarget.click();

    await waitForCondition(
      () =>
        (document.querySelector('.view-tab[data-view-target="stream"]') as HTMLButtonElement).classList.contains(
          "is-active",
        ),
      { message: "Expected stream tab to become active after drilldown." },
    );
    expect((document.getElementById("active-query-chips")?.textContent || "").toLowerCase()).toContain(
      "timeline:",
    );
  });

  test("load-more appends results using cursor without mocks", async () => {
    await resetToBaseline();

    const limit = document.getElementById("query-limit") as HTMLInputElement;
    limit.value = "200";
    limit.dispatchEvent(new Event("change", { bubbles: true }));

    const runButton = document.getElementById("refresh-button") as HTMLButtonElement;
    runButton.click();
    await waitForLoadedStatus();
    await waitForApiQuiet();

    const loadMoreButton = document.getElementById("stream-load-more-button") as HTMLButtonElement;
    await waitForCondition(() => !loadMoreButton.hidden, {
      message: "Expected load more button to be visible.",
    });

    const metricLoaded = document.getElementById("metric-loaded") as HTMLElement;
    const before = Number.parseInt(metricLoaded.textContent || "0", 10);
    loadMoreButton.click();
    await waitForLoadedStatus();
    await waitForApiQuiet();

    const after = Number.parseInt(metricLoaded.textContent || "0", 10);
    expect(after).toBeGreaterThan(before);
    expect(
      apiServer.requests.some(
        (item) => item.pathname === "/api/logs" && item.searchParams.has("cursor"),
      ),
    ).toBe(true);
  });

  test("scope history/back + recent scope restore are available", async () => {
    await resetToBaseline();

    const errorsPreset = document.querySelector('[data-preset="errors24h"]');
    const auditPreset = document.querySelector('[data-preset="audit7d"]');
    expect(errorsPreset).toBeInstanceOf(HTMLButtonElement);
    expect(auditPreset).toBeInstanceOf(HTMLButtonElement);

    (errorsPreset as HTMLButtonElement).click();
    await waitForLoadedStatus();
    await waitForApiQuiet();
    (auditPreset as HTMLButtonElement).click();
    await waitForLoadedStatus();
    await waitForApiQuiet();

    const recentScopeSelect = document.getElementById("recent-scope-select") as HTMLSelectElement;
    const scopeBackButton = document.getElementById("scope-back-button") as HTMLButtonElement;

    expect(recentScopeSelect.options.length).toBeGreaterThan(1);
    expect(scopeBackButton.disabled).toBe(false);

    scopeBackButton.click();
    await waitForCondition(() => getStatusText().includes("Restored scope:"), {
      timeoutMs: 10_000,
      message: "Expected scope restoration status message.",
    });

    const queryLevel = document.getElementById("query-level") as HTMLSelectElement;
    const queryAudit = document.getElementById("query-audit") as HTMLSelectElement;
    expect(queryLevel.value).toBe("ERROR");
    expect(queryAudit.value).toBe("");
  });

  test("supports saved query lifecycle (save, run, delete)", async () => {
    await resetToBaseline();

    const queryLevel = document.getElementById("query-level") as HTMLSelectElement;
    queryLevel.value = "WARN";
    queryLevel.dispatchEvent(new Event("change", { bubbles: true }));

    const savedQueryName = document.getElementById("saved-query-name") as HTMLInputElement;
    const saveButton = document.getElementById("save-query-button") as HTMLButtonElement;
    const savedQuerySelect = document.getElementById("saved-query-select") as HTMLSelectElement;
    const deleteSavedQueryButton = document.getElementById(
      "delete-saved-query-button",
    ) as HTMLButtonElement;

    savedQueryName.value = "warn-check";
    savedQueryName.dispatchEvent(new Event("input", { bubbles: true }));
    saveButton.click();
    expect(getStatusText()).toContain('Saved query "warn-check".');
    expect([...savedQuerySelect.options].some((option) => option.value === "warn-check")).toBe(true);

    queryLevel.value = "ERROR";
    queryLevel.dispatchEvent(new Event("change", { bubbles: true }));
    savedQuerySelect.value = "warn-check";
    savedQuerySelect.dispatchEvent(new Event("change", { bubbles: true }));
    await waitForLoadedStatus();
    await waitForApiQuiet();
    expect(queryLevel.value).toBe("WARN");

    deleteSavedQueryButton.click();
    expect(getStatusText()).toContain('Deleted saved query "warn-check".');
    expect([...savedQuerySelect.options].some((option) => option.value === "warn-check")).toBe(false);
  });

  test("supports command palette action execution", async () => {
    await resetToBaseline();

    const commandOpen = new KeyboardEvent("keydown", {
      key: "k",
      ctrlKey: true,
      bubbles: true,
    });
    window.dispatchEvent(commandOpen);

    const commandModal = document.getElementById("command-palette-modal") as HTMLDialogElement;
    const commandInput = document.getElementById("command-palette-input") as HTMLInputElement;
    expect(commandModal.open).toBe(true);

    commandInput.value = "errors 24h";
    commandInput.dispatchEvent(new Event("input", { bubbles: true }));
    commandInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await waitForLoadedStatus();
    await waitForApiQuiet();

    const queryLevel = document.getElementById("query-level") as HTMLSelectElement;
    expect(queryLevel.value).toBe("ERROR");
  });

  test("copies correlation id and chain JSON payloads", async () => {
    await resetToBaseline();

    const correlationsTab = document.querySelector(
      '.view-tab[data-view-target="correlations"]',
    ) as HTMLButtonElement;
    correlationsTab.click();
    await waitForCondition(
      () => Boolean(document.querySelector("#correlation-groups [data-copy-correlation-id]")),
      { message: "Expected correlation copy button to exist." },
    );
    const copyCorrelation = document.querySelector(
      "#correlation-groups [data-copy-correlation-id]",
    ) as HTMLButtonElement;
    copyCorrelation.click();
    await waitForCondition(() => getStatusText().includes("Copied correlation ID"), {
      message: "Expected correlation copy status.",
    });
    const copiedCorrelation = await navigator.clipboard.readText();
    expect(copiedCorrelation.length).toBeGreaterThan(0);

    const streamTab = document.querySelector('.view-tab[data-view-target="stream"]') as HTMLButtonElement;
    streamTab.click();
    const expand = document.querySelector("#logs-tbody .expand-button") as HTMLButtonElement;
    expand.click();
    const copyChain = document.querySelector("#logs-tbody [data-copy-chain-id]") as HTMLButtonElement;
    copyChain.click();
    await waitForCondition(() => getStatusText().includes("Copied chain JSON"), {
      message: "Expected chain JSON copy status.",
    });
    const chainPayload = await navigator.clipboard.readText();
    expect(chainPayload).toContain('"correlation"');
    expect(chainPayload).toContain('"entries"');
  });

  test("shows rich empty state and recovers via action button", async () => {
    await resetToBaseline();

    const localField = document.getElementById("local-field") as HTMLInputElement;
    const localValue = document.getElementById("local-value") as HTMLInputElement;
    localField.value = "*";
    localValue.value = "value-that-does-not-exist-anywhere";
    localValue.dispatchEvent(new Event("input", { bubbles: true }));

    await waitForCondition(
      () => Boolean(document.querySelector("#logs-tbody .empty-state-rich")),
      { message: "Expected rich empty state to render." },
    );

    const clearLocalAction = document.querySelector(
      '#logs-tbody button[data-empty-action="clear-local-filter"]',
    ) as HTMLButtonElement;
    expect(clearLocalAction).toBeInstanceOf(HTMLButtonElement);
    clearLocalAction.click();
    await waitForCondition(
      () => document.querySelectorAll("#logs-tbody tr.row-main").length > 0,
      { message: "Expected rows to return after clear local filter action." },
    );
  });

  test("supports panel/help keyboard toggles", async () => {
    const queryDetails = document.querySelector(".query-details") as HTMLDetailsElement;
    const inspectDetails = document.querySelector(".inspect-panel") as HTMLDetailsElement;
    const shortcutsModal = document.getElementById("shortcuts-modal") as HTMLDialogElement;

    const initialQueryOpen = queryDetails.open;
    const initialInspectOpen = inspectDetails.open;

    dispatchShortcut("q");
    expect(queryDetails.open).toBe(!initialQueryOpen);
    dispatchShortcut("q");
    expect(queryDetails.open).toBe(initialQueryOpen);

    dispatchShortcut("i");
    expect(inspectDetails.open).toBe(!initialInspectOpen);
    dispatchShortcut("i");
    expect(inspectDetails.open).toBe(initialInspectOpen);

    dispatchShortcut("?");
    expect(shortcutsModal.open).toBe(true);
    dispatchShortcut("?");
    expect(shortcutsModal.open).toBe(false);
  });
});
