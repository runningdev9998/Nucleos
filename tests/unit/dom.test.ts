// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { fillInput, hasBotCheck, readKhanError, waitFor } from "../../extension/src/lib/dom";
import { loginFormHtml } from "../fixtures/login-form";

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("readKhanError", () => {
  it("returns null when the form shows no error", () => {
    document.body.innerHTML = loginFormHtml();
    expect(readKhanError()).toBeNull();
  });

  it("returns the server error exactly as Khan Academy renders it", () => {
    document.body.innerHTML = loginFormHtml({ serverError: "Your login or password is incorrect." });
    expect(readKhanError()).toBe("Your login or password is incorrect.");
  });

  it("does not mistake helper text or the password-visibility announcement for an error", () => {
    document.body.innerHTML = loginFormHtml();
    expect(document.body.textContent).toContain("Password is hidden");
    expect(readKhanError()).toBeNull();
  });

  it("returns field-level validation errors", () => {
    document.body.innerHTML = loginFormHtml({ identifierError: "Email or username is required." });
    expect(readKhanError()).toBe("Email or username is required.");
  });

  it("prefers the server error over field errors", () => {
    document.body.innerHTML = loginFormHtml({ serverError: "Server says no.", passwordError: "Field says no." });
    expect(readKhanError()).toBe("Server says no.");
  });
});

describe("fillInput", () => {
  it("sets the value and fires the events React listens for", () => {
    document.body.innerHTML = loginFormHtml();
    const input = document.querySelector<HTMLInputElement>('[data-testid="identifier-field"]')!;
    const events: string[] = [];
    input.addEventListener("input", () => events.push("input"));
    input.addEventListener("change", () => events.push("change"));

    fillInput(input, "learner@example.com");

    expect(input.value).toBe("learner@example.com");
    expect(events).toEqual(["input", "change"]);
  });
});

describe("hasBotCheck", () => {
  it("detects a CAPTCHA iframe", () => {
    document.body.innerHTML = `<iframe src="https://www.google.com/recaptcha/api2/anchor"></iframe>`;
    expect(hasBotCheck()).toBe(true);
  });

  it("is false on the normal login form", () => {
    document.body.innerHTML = loginFormHtml();
    expect(hasBotCheck()).toBe(false);
  });
});

describe("waitFor", () => {
  it("resolves once the DOM changes to satisfy the probe", async () => {
    document.body.innerHTML = loginFormHtml();
    const pending = waitFor(() => readKhanError(), { timeoutMs: 1000 });
    document.body.innerHTML = loginFormHtml({ serverError: "Your login or password is incorrect." });
    await expect(pending).resolves.toBe("Your login or password is incorrect.");
  });

  it("resolves null after the timeout", async () => {
    await expect(waitFor(() => null, { timeoutMs: 20 })).resolves.toBeNull();
  });
});
