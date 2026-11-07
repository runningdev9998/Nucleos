import { parseConfig, type ConfigResult } from "./lib/config";
import type { Outcome, PendingSuccess, Request } from "./lib/messages";
import { canAttempt, isPendingFresh } from "./lib/policy";

const LOG = "[KA Auto Sign-in]";
const FAILURES_KEY = "consecutiveFailures";
const pendingKey = (tabId: number) => `pendingSuccess:${tabId}`;

chrome.runtime.onMessage.addListener((request: Request, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  handle(request, tabId).then(sendResponse, (error: unknown) => {
    console.error(LOG, "message handler failed", error);
    sendResponse(null);
  });
  return true;
});

async function handle(request: Request, tabId: number | undefined): Promise<unknown> {
  switch (request.type) {
    case "get-config":
      return loadConfig();
    case "begin-attempt":
      return canAttempt(await getFailures());
    case "record-outcome":
      await recordOutcome(request.outcome);
      return null;
    case "record-pending-success":
      if (tabId !== undefined) await chrome.storage.session.set({ [pendingKey(tabId)]: request.pending });
      return null;
    case "take-pending-success":
      return tabId === undefined ? null : takePending(tabId);
  }
}

async function loadConfig(): Promise<ConfigResult> {
  try {
    const response = await fetch(chrome.runtime.getURL("config.json"), { cache: "no-store" });
    return parseConfig(await response.json());
  } catch (error) {
    return { ok: false, error: `could not read config.json: ${String(error)}` };
  }
}

async function getFailures(): Promise<number> {
  const stored = await chrome.storage.session.get(FAILURES_KEY);
  return typeof stored[FAILURES_KEY] === "number" ? stored[FAILURES_KEY] : 0;
}

async function recordOutcome(outcome: Outcome): Promise<void> {
  if (outcome.kind === "failure") {
    await chrome.storage.session.set({ [FAILURES_KEY]: (await getFailures()) + 1 });
    console.warn(LOG, "Sign-in failed. Khan Academy said:", JSON.stringify(outcome.message), outcome.code ?? "");
  } else if (outcome.kind === "success") {
    await chrome.storage.session.set({ [FAILURES_KEY]: 0 });
    console.info(LOG, "Signed in to Khan Academy as", outcome.account);
  } else {
    console.warn(LOG, "Sign-in outcome unknown:", outcome.reason);
  }
}

async function takePending(tabId: number): Promise<PendingSuccess | null> {
  const key = pendingKey(tabId);
  const stored = await chrome.storage.session.get(key);
  await chrome.storage.session.remove(key);
  const pending = stored[key] as PendingSuccess | undefined;
  return pending && isPendingFresh(pending.recordedAt, Date.now()) ? pending : null;
}
