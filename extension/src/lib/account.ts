import { maskEmail } from "../../../shared/mask";

const IDENTITY_FIELDS = ["email", "username"] as const;

/**
 * Checks the user Khan Academy signed in against the configured username.
 * Returns null when the response carries no identifying field to compare.
 */
export function matchesConfiguredAccount(user: Record<string, unknown>, configuredUsername: string): boolean | null {
  const wanted = configuredUsername.trim().toLowerCase();
  const identities = IDENTITY_FIELDS.map((field) => user[field]).filter(
    (value): value is string => typeof value === "string" && value !== "",
  );
  if (identities.length === 0) return null;
  return identities.some((identity) => identity.toLowerCase() === wanted);
}

/** A label for the signed-in account that is safe to show and log (no password, email masked). */
export function describeAccount(user: Record<string, unknown>, configuredUsername: string): string {
  for (const field of ["username", "nickname"] as const) {
    const value = user[field];
    if (typeof value === "string" && value !== "") return value;
  }
  return maskEmail(typeof user.email === "string" ? user.email : configuredUsername);
}
