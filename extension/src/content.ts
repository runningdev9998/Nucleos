import { classifyLoginResponse, isLoginPath, LOGIN_SELECTORS, type LoginVerdict } from "../../shared/khan";
import { maskEmail } from "../../shared/mask";
import { describeAccount, matchesConfiguredAccount } from "./lib/account";
import type { Credentials } from "./lib/config";
import { fillInput, hasBotCheck, readKhanError, waitFor } from "./lib/dom";
import { isLoginResponseMessage, send, type Outcome } from "./lib/messages";
import { awaitOutcome } from "./lib/outcome";
import { signedInAs } from "./lib/session";
import { showToast } from "./lib/toast";

const LOG = "[KA Auto Sign-in]";
const TITLE = "Khan Academy auto sign-in";
const FORM_TIMEOUT_MS = 15_000;
const CONFIRM_TIMEOUT_MS = 15_000;

let attemptInProgress = false;

void main();

async function main(): Promise<void> {
  await confirmPendingSuccess();
  watchLoginVisits(() => void attemptSignIn());
}

/** Calls onVisit each time the tab arrives on the login page, including client-side navigations. */
function watchLoginVisits(onVisit: () => void): void {
  let wasOnLogin = false;
  const check = () => {
    const onLogin = isLoginPath(location.pathname);
    if (onLogin && !wasOnLogin) onVisit();
    wasOnLogin = onLogin;
  };
  check();
  setInterval(check, 500);
}

async function attemptSignIn(): Promise<void> {
  if (attemptInProgress) return;
  attemptInProgress = true;
  try {
    const gate = await send({ type: "begin-attempt" });
    if (!gate.allowed) {
      showToast("info", TITLE, gate.reason ?? "Sign-in skipped.");
      console.warn(LOG, gate.reason);
      return;
    }

    const config = await send({ type: "get-config" });
    if (!config.ok) {
      showToast("error", TITLE, `Configuration problem: ${config.error}`);
      console.error(LOG, "Configuration problem:", config.error);
      return;
    }

    const result = await submitOnce(config.credentials);
    if (result) await report(result);
  } finally {
    attemptInProgress = false;
  }
}

async function submitOnce(credentials: Credentials): Promise<Outcome | null> {
  const form = await waitFor(findLoginForm, { timeoutMs: FORM_TIMEOUT_MS });
  if (!form) return { kind: "unknown", reason: "The Khan Academy login form did not appear." };
  if (hasBotCheck()) {
    return { kind: "unknown", reason: "Khan Academy showed a bot check. The extension does not bypass it." };
  }

  const loginResponse = nextLoginResponse();
  fillInput(form.username, credentials.username);
  fillInput(form.password, credentials.password);
  form.submit.click();
  console.info(LOG, "Submitted sign-in for", maskEmail(credentials.username));

  const result = await awaitOutcome({
    loginResponse,
    khanError: (timeoutMs) => waitFor(() => readKhanError(), { timeoutMs }),
    botCheck: (timeoutMs) => waitFor(() => hasBotCheck() || null, { timeoutMs }).then(Boolean),
  });
  if (result.kind !== "accepted") return result;

  if (matchesConfiguredAccount(result.user, credentials.username) === false) {
    return { kind: "unknown", reason: "Khan Academy signed in an account other than the configured one." };
  }
  await send({
    type: "record-pending-success",
    pending: { account: describeAccount(result.user, credentials.username), recordedAt: Date.now() },
  });
  console.info(LOG, "Khan Academy accepted the sign-in; confirming the session on the next page.");

  // A full page load hands confirmation to the next document. If Khan Academy navigates
  // client-side instead, this document survives and confirms it here.
  const left = await waitFor(() => !isLoginPath(location.pathname) || null, { timeoutMs: CONFIRM_TIMEOUT_MS });
  if (left) {
    await confirmPendingSuccess();
    return null;
  }
  await send({ type: "take-pending-success" });
  return { kind: "unknown", reason: "Khan Academy accepted the sign-in but never left the login page." };
}

/** Runs on every Khan Academy page load; only acts if a sign-in from this tab is awaiting confirmation. */
async function confirmPendingSuccess(): Promise<void> {
  const pending = await send({ type: "take-pending-success" });
  if (!pending) return;
  const confirmed = await waitFor(() => signedInAs(document), { timeoutMs: CONFIRM_TIMEOUT_MS });
  await report(
    confirmed
      ? { kind: "success", account: pending.account }
      : { kind: "unknown", reason: "Khan Academy accepted the sign-in, but this page does not show a signed-in user." },
  );
}

function findLoginForm() {
  const username = document.querySelector<HTMLInputElement>(LOGIN_SELECTORS.username);
  const password = document.querySelector<HTMLInputElement>(LOGIN_SELECTORS.password);
  const submit = document.querySelector<HTMLButtonElement>(LOGIN_SELECTORS.submit);
  return username && password && submit ? { username, password, submit } : null;
}

function nextLoginResponse(): Promise<LoginVerdict> {
  return new Promise((resolve) => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== location.origin) return;
      if (!isLoginResponseMessage(event.data)) return;
      window.removeEventListener("message", onMessage);
      resolve(classifyLoginResponse(event.data.body));
    };
    window.addEventListener("message", onMessage);
  });
}

async function report(outcome: Outcome): Promise<void> {
  switch (outcome.kind) {
    case "failure":
      showToast("error", "Khan Academy sign-in failed", outcome.message);
      console.warn(LOG, "Sign-in failed. Khan Academy said:", JSON.stringify(outcome.message));
      break;
    case "success":
      showToast("success", "Signed in to Khan Academy", `Signed in as ${outcome.account}.`);
      console.info(LOG, "Signed in to Khan Academy as", outcome.account);
      break;
    case "unknown":
      showToast("info", "Khan Academy sign-in: outcome unknown", outcome.reason);
      console.warn(LOG, "Outcome unknown:", outcome.reason);
      break;
  }
  await send({ type: "record-outcome", outcome });
}
