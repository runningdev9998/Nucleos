import { describe, expect, it } from "vitest";
import { classifyLoginResponse, graphqlOperationName, isLoginPath } from "../../shared/khan";
import { INVALID_CREDENTIALS_RESPONSE, LOGIN_MUTATION_URL } from "../fixtures/login-form";

describe("classifyLoginResponse", () => {
  it("reads Khan Academy's real wrong-credentials response as a failure with its code", () => {
    expect(classifyLoginResponse(INVALID_CREDENTIALS_RESPONSE)).toEqual({ kind: "failure", code: "INVALID_CREDENTIALS" });
  });

  it("treats a returned user with no error as success", () => {
    const body = { data: { loginWithPassword: { error: null, user: { id: "kaid_1", email: "a@b.co" } } } };
    expect(classifyLoginResponse(body)).toEqual({ kind: "success", user: { id: "kaid_1", email: "a@b.co" } });
  });

  it("never reports success when the shape is unexpected", () => {
    for (const body of [
      null,
      "ok",
      {},
      { data: null },
      { errors: [{ message: "Error from backend service" }] },
      { data: { loginWithPassword: null } },
      { data: { loginWithPassword: { error: null, user: null } } },
      { data: { loginWithPassword: { error: null, user: "kaid_1" } } },
    ]) {
      expect(classifyLoginResponse(body).kind).toBe("unrecognized");
    }
  });

  it("treats an error with a user as a failure, not a success", () => {
    const body = { data: { loginWithPassword: { error: { code: "RATE_LIMITED" }, user: { id: "x" } } } };
    expect(classifyLoginResponse(body)).toEqual({ kind: "failure", code: "RATE_LIMITED" });
  });

  it("falls back to UNKNOWN when the error has no code", () => {
    expect(classifyLoginResponse({ data: { loginWithPassword: { error: {} } } })).toEqual({ kind: "failure", code: "UNKNOWN" });
  });
});

describe("graphqlOperationName", () => {
  it("extracts the operation from Khan Academy's URL format", () => {
    expect(graphqlOperationName(LOGIN_MUTATION_URL)).toBe("loginWithPasswordMutation");
  });

  it("returns null for non-GraphQL URLs", () => {
    expect(graphqlOperationName("https://www.khanacademy.org/login")).toBeNull();
  });
});

describe("isLoginPath", () => {
  it.each([
    ["/login", true],
    ["/login/", true],
    ["/login/teacher", true],
    ["/loginx", false],
    ["/signup", false],
    ["/", false],
  ])("%s -> %s", (path, expected) => {
    expect(isLoginPath(path)).toBe(expected);
  });
});
