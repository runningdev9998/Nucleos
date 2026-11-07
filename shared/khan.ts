export const KHAN_ORIGIN = "https://www.khanacademy.org";
export const LOGIN_MUTATION = "loginWithPasswordMutation";

/** Selectors observed on https://www.khanacademy.org/login (see docs/recon.md). */
export const LOGIN_SELECTORS = {
  username: '[data-testid="identifier-field"]',
  password: '[data-testid="password-field"]',
  submit: '[data-testid="log-in-submit-button"]',
  serverError: "#log-in-server-error",
  fieldErrors: ['[data-testid="identifier-error"]', '[data-testid="password-error"]'],
} as const;

export const BOT_CHECK_SELECTOR = [
  'iframe[src*="recaptcha"]',
  'iframe[src*="hcaptcha"]',
  'iframe[src*="challenges.cloudflare.com"]',
  'iframe[src*="arkoselabs"]',
  'iframe[title*="captcha" i]',
].join(",");

export function isLoginPath(pathname: string): boolean {
  return pathname === "/login" || pathname.startsWith("/login/");
}

export function graphqlOperationName(url: string): string | null {
  const match = /\/api\/internal\/graphql\/([^/?#]+)/.exec(url);
  return match?.[1] ?? null;
}

export type LoginVerdict =
  | { kind: "success"; user: Record<string, unknown> }
  | { kind: "failure"; code: string }
  | { kind: "unrecognized" };

/**
 * Interprets Khan Academy's own answer to the login mutation. Anything that is
 * not an unambiguous success or an explicit error is "unrecognized", never success.
 */
export function classifyLoginResponse(body: unknown): LoginVerdict {
  if (!isRecord(body) || !isRecord(body.data)) return { kind: "unrecognized" };
  const result = body.data.loginWithPassword;
  if (!isRecord(result)) return { kind: "unrecognized" };

  if (result.error != null) {
    const code = isRecord(result.error) && typeof result.error.code === "string" ? result.error.code : "UNKNOWN";
    return { kind: "failure", code };
  }
  if (isRecord(result.user)) return { kind: "success", user: result.user };
  return { kind: "unrecognized" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
