/** Consecutive failed sign-ins allowed per browser session before the extension stops trying. */
export const MAX_CONSECUTIVE_FAILURES = 3;

/** How long a sign-in Khan Academy accepted may wait for the next page to confirm it. */
export const PENDING_SUCCESS_TTL_MS = 60_000;

export function canAttempt(consecutiveFailures: number): { allowed: boolean; reason?: string } {
  if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    return {
      allowed: false,
      reason:
        `Skipped: ${consecutiveFailures} sign-ins failed in a row this browser session. ` +
        "Fix config.json and reload the extension to try again (this protects the account from lockout).",
    };
  }
  return { allowed: true };
}

export function isPendingFresh(recordedAt: number, now: number): boolean {
  return now - recordedAt >= 0 && now - recordedAt <= PENDING_SUCCESS_TTL_MS;
}
