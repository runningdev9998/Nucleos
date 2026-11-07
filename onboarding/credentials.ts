import { randomInt } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

export const CREDENTIALS_FILE = ".credentials.local.json";

export type AccountStatus = "submitted" | "verified" | "failed";

export interface StoredAccount {
  email: string;
  password: string;
  status: AccountStatus;
  updatedAt: string;
}

const ALPHABETS = ["abcdefghijkmnpqrstuvwxyz", "ABCDEFGHJKLMNPQRSTUVWXYZ", "23456789", "!#%+-=?@_"];

/** Random password with every character class present, long enough to clear Khan Academy's 8-character rule. */
export function generatePassword(length = 20): string {
  if (length < ALPHABETS.length) throw new Error("password too short");
  const all = ALPHABETS.join("");
  const chars = ALPHABETS.map(pick);
  while (chars.length < length) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
}

function pick(alphabet: string): string {
  return alphabet[randomInt(alphabet.length)]!;
}

export function readStoredAccount(path = CREDENTIALS_FILE): StoredAccount | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as StoredAccount;
}

export function writeStoredAccount(account: Omit<StoredAccount, "updatedAt">, path = CREDENTIALS_FILE): void {
  const record: StoredAccount = { ...account, updatedAt: new Date().toISOString() };
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
}

/**
 * Decides whether sign-up may run. The brief allows re-running only when a previous
 * sign-up failed, so a submitted or verified account blocks a new one.
 */
export function signupGate(existing: StoredAccount | null, email: string): { run: boolean; reason?: string } {
  if (!existing || existing.status === "failed") return { run: true };
  if (existing.status === "verified") {
    return { run: false, reason: "An account was already created and verified. Not creating another." };
  }
  return {
    run: false,
    reason:
      existing.email.toLowerCase() === email.toLowerCase()
        ? "A sign-up for this email was submitted but never verified. Run `npm run signup -- --verify-only` to check it."
        : "A previous sign-up was submitted but never verified. Run `npm run signup -- --verify-only` before creating another.",
  };
}
