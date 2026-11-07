import { chromium, type Browser, type Locator, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { matchesConfiguredAccount } from "../extension/src/lib/account";
import {
  BOT_CHECK_SELECTOR,
  classifyLoginResponse,
  graphqlOperationName,
  KHAN_ORIGIN,
  LOGIN_MUTATION,
  LOGIN_SELECTORS,
} from "../shared/khan";
import { maskEmail } from "../shared/mask";
import { generatePassword, readStoredAccount, signupGate, writeStoredAccount, type StoredAccount } from "./credentials";

const STEP_TIMEOUT_MS = 30_000;
const HUMAN_TIMEOUT_MS = 5 * 60_000;
const ADULT_BIRTH_MONTH = "Jan";
const ADULT_BIRTH_YEAR = "1990";

const EXIT = { created: 0, notCreated: 1, unproven: 2, usage: 64 } as const;

type SignupResult =
  | { kind: "submitted" }
  | { kind: "rejected"; message: string }
  | { kind: "blocked"; reason: string };

type Proof = { kind: "proven" } | { kind: "disproven"; reason: string } | { kind: "unproven"; reason: string };

async function main(): Promise<number> {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const args = new Set(process.argv.slice(2));
  const headless = args.has("--headless");
  const stored = readStoredAccount();

  if (args.has("--verify-only")) {
    if (!stored) return usage("No .credentials.local.json found; nothing to verify.");
    return withBrowser(headless, (browser) => proveAndRecord(browser, stored.email, stored.password));
  }

  const email = process.env.KA_EMAIL?.trim();
  if (!email) return usage("Set KA_EMAIL (in the environment or .env) to the email for the new account.");

  const gate = signupGate(stored, email);
  if (!gate.run) {
    log(gate.reason!);
    return stored?.status === "verified" ? EXIT.created : EXIT.unproven;
  }

  const password = process.env.KA_PASSWORD || generatePassword();
  return withBrowser(headless, async (browser) => {
    const signup = await submitSignup(browser, email, password, headless);
    if (signup.kind === "rejected") {
      writeStoredAccount({ email, password, status: "failed" });
      result("NOT CREATED", `Khan Academy said: "${signup.message}"`);
      return EXIT.notCreated;
    }
    if (signup.kind === "blocked") {
      result("UNPROVEN", `${signup.reason} Run \`npm run signup -- --verify-only\` to check later.`);
      return EXIT.unproven;
    }
    log("Sign-up form accepted. Proving the account exists by signing in from a fresh browser session...");
    return proveAndRecord(browser, email, password);
  });
}

async function submitSignup(browser: Browser, email: string, password: string, headless: boolean): Promise<SignupResult> {
  const page = await browser.newPage();
  page.setDefaultTimeout(STEP_TIMEOUT_MS);

  log("Opening Khan Academy sign-up...");
  await page.goto(`${KHAN_ORIGIN}/signup`);
  await dismissCookieBanner(page);

  await page.getByRole("link", { name: /^Student\b/ }).click();
  await page.waitForURL(/\/signup\/learner\/birthday/);
  log(`Registering as an adult learner (born ${ADULT_BIRTH_MONTH} ${ADULT_BIRTH_YEAR}).`);
  await pickOption(page, "birthday-picker-month", ADULT_BIRTH_MONTH);
  await pickOption(page, "birthday-picker-year", ADULT_BIRTH_YEAR);
  await page.getByRole("button", { name: "Next", exact: true }).click();

  await page.waitForURL(/\/signup\/learner\/over-age-gate/);
  await page.getByTestId("tos-checkbox").check();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);

  if (await page.locator(BOT_CHECK_SELECTOR).count()) {
    const human = await waitForHuman(page, headless);
    if (human) return human;
  }

  // Record the credentials before submitting so a crash after Khan Academy creates the account cannot lose them.
  writeStoredAccount({ email, password, status: "submitted" });
  page.on("response", (response) => {
    const op = graphqlOperationName(response.url());
    if (op && /sign ?up|register|create/i.test(op)) log(`Khan Academy answered ${op} with HTTP ${response.status()}.`);
  });
  log(`Submitting sign-up for ${maskEmail(email)}...`);
  await page.getByRole("button", { name: "Sign up", exact: true }).click();

  return waitForSignupOutcome(page, headless);
}

async function waitForSignupOutcome(page: Page, headless: boolean, timeoutMs = STEP_TIMEOUT_MS): Promise<SignupResult> {
  const error = formError(page);
  const outcome = await Promise.race([
    unlessTimedOut(page.waitForURL((url) => !url.pathname.startsWith("/signup"), { timeout: timeoutMs }), "left-signup"),
    unlessTimedOut(error.waitFor({ timeout: timeoutMs }), "error"),
    unlessTimedOut(page.locator(BOT_CHECK_SELECTOR).first().waitFor({ state: "attached", timeout: timeoutMs }), "bot-check"),
    delay(timeoutMs).then(() => "timeout" as const),
  ]);

  switch (outcome) {
    case "left-signup":
      return { kind: "submitted" };
    case "error":
      return { kind: "rejected", message: (await error.innerText()).trim() };
    case "bot-check":
      return (await waitForHuman(page, headless)) ?? waitForSignupOutcome(page, headless, HUMAN_TIMEOUT_MS);
    case "timeout":
      return { kind: "blocked", reason: `Khan Academy gave no result within ${timeoutMs / 1000} s of submitting.` };
  }
}

/** Bot checks are left to a person. Returns a blocked result when nobody can solve it. */
async function waitForHuman(page: Page, headless: boolean): Promise<SignupResult | null> {
  if (headless) return { kind: "blocked", reason: "Khan Academy showed a bot check, which this script does not bypass." };
  log("Khan Academy is showing a bot check. Please complete it in the browser window (waiting up to 5 minutes).");
  await page
    .locator(BOT_CHECK_SELECTOR)
    .first()
    .waitFor({ state: "detached", timeout: HUMAN_TIMEOUT_MS })
    .catch(() => undefined);
  return null;
}

/**
 * The account counts as created only if Khan Academy itself signs in the new
 * credentials, in a browser context that shares nothing with the sign-up session.
 */
async function prove(browser: Browser, email: string, password: string): Promise<Proof> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(STEP_TIMEOUT_MS);
    await page.goto(`${KHAN_ORIGIN}/login`);
    await dismissCookieBanner(page);
    await page.locator(LOGIN_SELECTORS.username).fill(email);
    await page.locator(LOGIN_SELECTORS.password).fill(password);

    const responsePromise = page.waitForResponse((r) => graphqlOperationName(r.url()) === LOGIN_MUTATION);
    await page.locator(LOGIN_SELECTORS.submit).click();
    const response = await responsePromise.catch(() => null);
    if (!response) return { kind: "unproven", reason: "Khan Academy did not answer the verification sign-in." };

    const verdict = classifyLoginResponse(await response.json().catch(() => null));
    if (verdict.kind === "failure") {
      const shown = await page.locator(LOGIN_SELECTORS.serverError).innerText().catch(() => "");
      return { kind: "disproven", reason: `Signing in with the new credentials failed (${verdict.code}). ${shown.trim()}` };
    }
    if (verdict.kind === "unrecognized") {
      return { kind: "unproven", reason: `Unrecognized response to the verification sign-in (HTTP ${response.status()}).` };
    }
    if (process.env.KA_DEBUG) log(`Signed-in user fields: ${Object.keys(verdict.user).join(", ")}`);
    if (matchesConfiguredAccount(verdict.user, email) === false) {
      return { kind: "unproven", reason: "Khan Academy signed in a different account than the one just created." };
    }
    return { kind: "proven" };
  } finally {
    await context.close();
  }
}

async function proveAndRecord(browser: Browser, email: string, password: string): Promise<number> {
  const proof = await prove(browser, email, password);
  const status: StoredAccount["status"] =
    proof.kind === "proven" ? "verified" : proof.kind === "disproven" ? "failed" : "submitted";
  writeStoredAccount({ email, password, status });

  switch (proof.kind) {
    case "proven":
      result(
        "ACCOUNT CREATED",
        `Khan Academy signed in ${maskEmail(email)} from a fresh session. Credentials saved to .credentials.local.json (git-ignored).`,
      );
      return EXIT.created;
    case "disproven":
      result("NOT CREATED", proof.reason);
      return EXIT.notCreated;
    case "unproven":
      result("UNPROVEN", proof.reason);
      return EXIT.unproven;
  }
}

async function dismissCookieBanner(page: Page): Promise<void> {
  const button = page.getByRole("button", { name: "Strictly Necessary Only" });
  await button.click({ timeout: 8_000 }).catch(() => undefined);
}

async function pickOption(page: Page, pickerTestId: string, option: string): Promise<void> {
  await page.getByTestId(pickerTestId).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

function formError(page: Page): Locator {
  return page
    .locator('main form [role="alert"], main form [aria-live="assertive"]')
    .filter({ hasText: /\S/ })
    .first();
}

async function withBrowser(headless: boolean, run: (browser: Browser) => Promise<number>): Promise<number> {
  const browser = await chromium.launch({ headless });
  try {
    return await run(browser);
  } finally {
    await browser.close();
  }
}

/** Resolves with label when the wait succeeds; a timed-out wait never resolves, leaving the race to the others. */
function unlessTimedOut<L extends string>(wait: Promise<unknown>, label: L): Promise<L> {
  return wait.then(
    () => label,
    () => new Promise<never>(() => {}),
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(message: string): void {
  console.log(`[signup] ${message}`);
}

function result(label: string, detail: string): void {
  console.log(`\nRESULT: ${label}\n${detail}`);
}

function usage(message: string): number {
  console.error(`${message}\n\nUsage: KA_EMAIL=you@example.com npm run signup [-- --headless] [-- --verify-only]`);
  return EXIT.usage;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error("[signup] Unexpected error:", error instanceof Error ? error.message : error);
    result("UNPROVEN", "The script stopped before it could prove the account exists.");
    process.exitCode = EXIT.unproven;
  },
);
