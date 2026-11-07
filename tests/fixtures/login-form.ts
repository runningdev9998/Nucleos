/**
 * Khan Academy's login form as rendered on 2026-11-07 after a failed sign-in
 * (generated class names kept, values removed). Captured during recon; see docs/recon.md.
 */
export function loginFormHtml({ serverError = "", identifierError = "", passwordError = "" } = {}): string {
  const serverErrorBlock = serverError
    ? `<div id="log-in-server-error" aria-live="polite" role="alert" class="_1d2fry4s"><span class="_ztwoik5"></span><p class="_4i6g93n">${serverError}</p></div>`
    : "";
  return `
<form class="_1hnxo3e">
  <div id="username" data-testid="identifier" class="_7zhre1">
    <label for="username-field" id="username-label" data-testid="identifier-label">Email or username</label>
    <input id="username-field" type="text" placeholder="email@example.com" name="username" data-testid="identifier-field" autocomplete="username">
    <div id="username-error" aria-live="assertive" aria-atomic="true" data-testid="identifier-error" class="_1f7jlfab">${identifierError}</div>
  </div>
  <div id="current-password" data-testid="password" class="_7zhre1">
    <label for="current-password-field" id="current-password-label" data-testid="password-label">Password</label>
    <p id="current-password-description" data-testid="password-description">Must be at least 8 characters long and can't be a commonly used password.</p>
    <input id="current-password-field" type="password" name="current-password" data-testid="password-field" autocomplete="current-password">
    <div aria-live="polite" class="_sme9hgm">Password is hidden</div>
    <div id="current-password-error" aria-live="assertive" aria-atomic="true" data-testid="password-error" class="_1f7jlfab">${passwordError}</div>
  </div>
  <a href="/forgotpw">Forgot password?</a>
  ${serverErrorBlock}
  <button type="submit" data-testid="log-in-submit-button" data-kind="primary"><span>Log in</span></button>
</form>`;
}

/** Khan Academy's exact response body for an unknown account, captured during recon. */
export const INVALID_CREDENTIALS_RESPONSE = {
  data: {
    loginWithPassword: {
      __typename: "LoginWithPasswordMutation",
      error: { __typename: "LoginWithPasswordMutationError", code: "INVALID_CREDENTIALS" },
      isFirstLogin: null,
      user: null,
    },
  },
};

export const LOGIN_MUTATION_URL =
  "https://www.khanacademy.org/api/internal/graphql/loginWithPasswordMutation?hash=2760465835&lang=en&app=khanacademy&_=261106-2229-8fdbc5d12189_1794078059479";
