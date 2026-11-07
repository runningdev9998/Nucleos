import type { LoginVerdict } from "../../../shared/khan";
import type { Outcome } from "./messages";

/** What the login page tells us after we submit. All waits resolve; none reject. */
export interface LoginSignals {
  /** Khan Academy's answer to the login mutation. */
  loginResponse: Promise<LoginVerdict>;
  /** Resolves with the error text Khan Academy shows on the form, or null after timeoutMs. */
  khanError(timeoutMs: number): Promise<string | null>;
  /** Resolves true if a CAPTCHA or other bot check appears, false after timeoutMs. */
  botCheck(timeoutMs: number): Promise<boolean>;
}

export interface Timing {
  /** Longest we wait for any signal after submitting. */
  responseTimeoutMs: number;
  /** After Khan Academy rejects a sign-in, how long we wait for it to render its message. */
  messageGraceMs: number;
}

export const DEFAULT_TIMING: Timing = { responseTimeoutMs: 20_000, messageGraceMs: 5_000 };

export type AttemptResult =
  | Extract<Outcome, { kind: "failure" | "unknown" }>
  | { kind: "accepted"; user: Record<string, unknown> };

type FirstSignal =
  | { type: "message"; text: string }
  | { type: "response"; verdict: LoginVerdict }
  | { type: "bot-check" }
  | { type: "timeout" };

export async function awaitOutcome(signals: LoginSignals, timing: Timing = DEFAULT_TIMING): Promise<AttemptResult> {
  const { responseTimeoutMs, messageGraceMs } = timing;
  const first = await Promise.race<FirstSignal>([
    signals.khanError(responseTimeoutMs).then((text) => (text ? { type: "message", text } : { type: "timeout" })),
    signals.loginResponse.then((verdict) => ({ type: "response", verdict })),
    signals.botCheck(responseTimeoutMs).then((found) => (found ? { type: "bot-check" } : { type: "timeout" })),
    delay(responseTimeoutMs).then(() => ({ type: "timeout" })),
  ]);

  switch (first.type) {
    case "message": {
      const verdict = await settledOrUndefined(signals.loginResponse);
      if (verdict?.kind === "success") {
        return { kind: "unknown", reason: `Khan Academy accepted the sign-in but also showed: "${first.text}"` };
      }
      return { kind: "failure", message: first.text, code: verdict?.kind === "failure" ? verdict.code : undefined };
    }
    case "response": {
      const { verdict } = first;
      if (verdict.kind === "success") return { kind: "accepted", user: verdict.user };
      const text = await signals.khanError(messageGraceMs);
      if (verdict.kind === "failure") {
        return text
          ? { kind: "failure", message: text, code: verdict.code }
          : { kind: "unknown", reason: `Khan Academy rejected the sign-in (${verdict.code}) but displayed no message.` };
      }
      return text
        ? { kind: "failure", message: text }
        : { kind: "unknown", reason: "Khan Academy's response to the sign-in was not recognized." };
    }
    case "bot-check":
      return {
        kind: "unknown",
        reason: "Khan Academy showed a bot check. The extension does not bypass it; complete it yourself.",
      };
    case "timeout":
      return {
        kind: "unknown",
        reason: `No answer from Khan Academy within ${Math.round(responseTimeoutMs / 1000)} s of submitting.`,
      };
  }
}

/** The promise's value if it has already settled, otherwise undefined. */
async function settledOrUndefined<T>(promise: Promise<T>): Promise<T | undefined> {
  return Promise.race([promise, delay(0).then(() => undefined)]);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
