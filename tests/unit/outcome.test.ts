import { describe, expect, it } from "vitest";
import type { LoginVerdict } from "../../shared/khan";
import { awaitOutcome, type LoginSignals } from "../../extension/src/lib/outcome";

const TIMING = { responseTimeoutMs: 200, messageGraceMs: 50 };

function later<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}
const never = <T>() => new Promise<T>(() => {});

function signals({
  response = never<LoginVerdict>(),
  errorAfterMs,
  errorText = "Your login or password is incorrect.",
  botCheckAfterMs,
}: {
  response?: Promise<LoginVerdict>;
  errorAfterMs?: number;
  errorText?: string;
  botCheckAfterMs?: number;
}): LoginSignals {
  const errorAt = errorAfterMs === undefined ? undefined : Date.now() + errorAfterMs;
  const botAt = botCheckAfterMs === undefined ? undefined : Date.now() + botCheckAfterMs;
  return {
    loginResponse: response,
    khanError: (timeoutMs) => {
      if (errorAt === undefined) return later(timeoutMs, null);
      const wait = Math.max(0, errorAt - Date.now());
      return wait <= timeoutMs ? later(wait, errorText) : later(timeoutMs, null);
    },
    botCheck: (timeoutMs) => {
      if (botAt === undefined) return later(timeoutMs, false);
      const wait = Math.max(0, botAt - Date.now());
      return wait <= timeoutMs ? later(wait, true) : later(timeoutMs, false);
    },
  };
}

describe("awaitOutcome", () => {
  it("reports Khan Academy's message and code when the response comes first", async () => {
    const result = await awaitOutcome(
      signals({ response: later(10, { kind: "failure", code: "INVALID_CREDENTIALS" }), errorAfterMs: 30 }),
      TIMING,
    );
    expect(result).toEqual({
      kind: "failure",
      message: "Your login or password is incorrect.",
      code: "INVALID_CREDENTIALS",
    });
  });

  it("reports the message when it renders before the response is observed", async () => {
    const result = await awaitOutcome(signals({ errorAfterMs: 5 }), TIMING);
    expect(result).toEqual({ kind: "failure", message: "Your login or password is incorrect.", code: undefined });
  });

  it("does not invent a message when Khan Academy rejects without showing one", async () => {
    const result = await awaitOutcome(signals({ response: later(10, { kind: "failure", code: "LOCKED" }) }), TIMING);
    expect(result).toEqual({
      kind: "unknown",
      reason: "Khan Academy rejected the sign-in (LOCKED) but displayed no message.",
    });
  });

  it("returns accepted, not success, when Khan Academy returns a user", async () => {
    const user = { id: "kaid_1" };
    const result = await awaitOutcome(signals({ response: later(10, { kind: "success", user }) }), TIMING);
    expect(result).toEqual({ kind: "accepted", user });
  });

  it("is unknown when the page shows an error but the response claimed success", async () => {
    const result = await awaitOutcome(
      {
        loginResponse: Promise.resolve({ kind: "success", user: {} }),
        khanError: () => Promise.resolve("Something went wrong"),
        botCheck: () => never(),
      },
      TIMING,
    );
    expect(result).toEqual({
      kind: "unknown",
      reason: 'Khan Academy accepted the sign-in but also showed: "Something went wrong"',
    });
  });

  it("is unknown when nothing happens before the timeout", async () => {
    const result = await awaitOutcome(signals({}), TIMING);
    expect(result.kind).toBe("unknown");
    expect(result.kind === "unknown" && result.reason).toMatch(/^No answer from Khan Academy/);
  });

  it("stops at a bot check instead of reporting failure", async () => {
    const result = await awaitOutcome(signals({ botCheckAfterMs: 5 }), TIMING);
    expect(result.kind).toBe("unknown");
    expect(result.kind === "unknown" && result.reason).toMatch(/bot check/);
  });

  it("treats an unrecognized response with no message as unknown", async () => {
    const result = await awaitOutcome(signals({ response: later(5, { kind: "unrecognized" }) }), TIMING);
    expect(result).toEqual({ kind: "unknown", reason: "Khan Academy's response to the sign-in was not recognized." });
  });
});
