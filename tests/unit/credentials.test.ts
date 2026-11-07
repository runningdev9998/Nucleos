import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  generatePassword,
  readStoredAccount,
  signupGate,
  writeStoredAccount,
  type StoredAccount,
} from "../../onboarding/credentials";

const account = (status: StoredAccount["status"], email = "learner@example.com"): StoredAccount => ({
  email,
  password: "pw",
  status,
  updatedAt: "2026-11-07T00:00:00.000Z",
});

describe("generatePassword", () => {
  it("meets Khan Academy's length rule and includes every character class", () => {
    for (let i = 0; i < 50; i++) {
      const password = generatePassword();
      expect(password).toHaveLength(20);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[0-9]/);
      expect(password).toMatch(/[!#%+\-=?@_]/);
    }
  });

  it("does not repeat", () => {
    expect(new Set(Array.from({ length: 20 }, () => generatePassword())).size).toBe(20);
  });
});

describe("signupGate", () => {
  it("runs when there is no previous sign-up", () => {
    expect(signupGate(null, "learner@example.com").run).toBe(true);
  });

  it("re-runs only after a failed sign-up", () => {
    expect(signupGate(account("failed"), "learner@example.com").run).toBe(true);
  });

  it("refuses to create a second account once one is verified", () => {
    expect(signupGate(account("verified"), "other@example.com")).toMatchObject({ run: false });
  });

  it("asks for verification instead of re-submitting an unverified sign-up", () => {
    const gate = signupGate(account("submitted"), "learner@example.com");
    expect(gate.run).toBe(false);
    expect(gate.reason).toContain("--verify-only");
  });
});

describe("stored account", () => {
  it("round-trips through the git-ignored file", () => {
    const path = join(mkdtempSync(join(tmpdir(), "ka-")), "creds.json");
    writeStoredAccount({ email: "a@b.co", password: "pw", status: "verified" }, path);
    expect(readStoredAccount(path)).toMatchObject({ email: "a@b.co", password: "pw", status: "verified" });
    expect(JSON.parse(readFileSync(path, "utf8")).updatedAt).toMatch(/^\d{4}-/);
  });

  it("returns null when nothing is stored", () => {
    expect(readStoredAccount(join(tmpdir(), "does-not-exist-ka.json"))).toBeNull();
  });
});
