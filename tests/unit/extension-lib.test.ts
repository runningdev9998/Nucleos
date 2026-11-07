// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { maskEmail } from "../../shared/mask";
import { describeAccount, matchesConfiguredAccount } from "../../extension/src/lib/account";
import { parseConfig } from "../../extension/src/lib/config";
import { canAttempt, isPendingFresh, MAX_CONSECUTIVE_FAILURES, PENDING_SUCCESS_TTL_MS } from "../../extension/src/lib/policy";
import { showToast } from "../../extension/src/lib/toast";
import exampleConfig from "../../extension/config.example.json";

describe("parseConfig", () => {
  it("accepts the shipped example", () => {
    expect(parseConfig(exampleConfig).ok).toBe(true);
  });

  it("ships values that cannot be a real account", () => {
    expect(exampleConfig.username).toMatch(/\.invalid$/);
  });

  it.each([
    [null, "JSON object"],
    [{}, "username"],
    [{ username: "  ", password: "x" }, "username"],
    [{ username: "a@b.co" }, "password"],
    [{ username: "a@b.co", password: "" }, "password"],
  ])("rejects %j", (raw, mentions) => {
    const result = parseConfig(raw);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain(mentions);
  });

  it("trims the username but never the password", () => {
    expect(parseConfig({ username: " a@b.co ", password: " pw " })).toEqual({
      ok: true,
      credentials: { username: "a@b.co", password: " pw " },
    });
  });
});

describe("policy", () => {
  it("stops after repeated failures to protect the account", () => {
    expect(canAttempt(MAX_CONSECUTIVE_FAILURES - 1).allowed).toBe(true);
    expect(canAttempt(MAX_CONSECUTIVE_FAILURES).allowed).toBe(false);
  });

  it("expires pending successes", () => {
    expect(isPendingFresh(1000, 1000 + PENDING_SUCCESS_TTL_MS)).toBe(true);
    expect(isPendingFresh(1000, 1001 + PENDING_SUCCESS_TTL_MS)).toBe(false);
    expect(isPendingFresh(2000, 1000)).toBe(false);
  });
});

describe("account identity", () => {
  it("matches email case-insensitively", () => {
    expect(matchesConfiguredAccount({ email: "Learner@Example.com" }, "learner@example.com")).toBe(true);
  });

  it("matches a username login", () => {
    expect(matchesConfiguredAccount({ email: "x@y.z", username: "learner42" }, "learner42")).toBe(true);
  });

  it("detects a different account", () => {
    expect(matchesConfiguredAccount({ email: "other@example.com" }, "learner@example.com")).toBe(false);
  });

  it("returns null when there is nothing to compare", () => {
    expect(matchesConfiguredAccount({ kaid: "kaid_1" }, "learner@example.com")).toBeNull();
  });

  it("describes the account without exposing the full email", () => {
    expect(describeAccount({ email: "learner@example.com" }, "x")).toBe("l***@example.com");
    expect(describeAccount({ username: "learner42" }, "x")).toBe("learner42");
  });

  it("masks emails and short usernames", () => {
    expect(maskEmail("jane@example.com")).toBe("j***@example.com");
    expect(maskEmail("ab")).toBe("**");
  });
});

describe("showToast", () => {
  it("shows Khan Academy's message verbatim, as text rather than HTML", () => {
    const message = 'Your login or password is incorrect. <img src=x onerror="alert(1)">';
    const host = showToast("error", "Khan Academy sign-in failed", message);
    const shown = host.shadowRoot!.querySelector('[data-testid="toast-message"]')!;
    expect(shown.textContent).toBe(message);
    expect(host.shadowRoot!.querySelector("img")).toBeNull();
  });

  it("replaces the previous toast instead of stacking", () => {
    showToast("info", "a", "first");
    showToast("success", "b", "second");
    expect(document.querySelectorAll("#ka-auto-signin-toast")).toHaveLength(1);
  });
});
