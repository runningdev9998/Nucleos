# Khan Academy recon (2026-11-07)

Observed by hand in a browser before writing code. Nothing here was guessed; anything still unverified is marked.

## Login page — `https://www.khanacademy.org/login`

Client-rendered React form. Stable `data-testid` attributes:

| Element | Selector |
| --- | --- |
| Email or username | `[data-testid="identifier-field"]` (`#username-field`) |
| Password | `[data-testid="password-field"]` (`#current-password-field`) |
| Submit | `[data-testid="log-in-submit-button"]` |
| Field errors | `[data-testid="identifier-error"]`, `[data-testid="password-error"]` (`aria-live="assertive"`, empty until an error) |
| Server error | `#log-in-server-error` (`role="alert"`), inserted only after a rejected sign-in |

No CAPTCHA was present on the login page.

### Wrong credentials

One attempt with a made-up address (`…@example.com`, no such account, so no real account was put at risk):

- Page shows: `Your login or password is incorrect.` inside `#log-in-server-error > p`.
- Network: `POST /api/internal/graphql/loginWithPasswordMutation?hash=…` returned HTTP 200 with

```json
{"data":{"loginWithPassword":{"__typename":"LoginWithPasswordMutation","error":{"__typename":"LoginWithPasswordMutationError","code":"INVALID_CREDENTIALS"},"isFirstLogin":null,"user":null}}}
```

So HTTP status says nothing; the outcome is in `data.loginWithPassword.error` / `.user`.

### Why the extension watches the login response instead of querying "who am I"

Khan Academy's GraphQL endpoint only runs safelisted queries: an ad-hoc `getFullUserProfile`
GET returned `No hash= specified` and a POST returned `403 Operation not found in safelist`.
The extension therefore cannot ask the server who is signed in. Instead it reads the
response Khan Academy itself returns for the login it submitted.

## Sign-up flow — `https://www.khanacademy.org/signup`

1. Role choice: links "Student", "Family", "Teacher". Student goes to `/signup/learner/birthday`.
2. Birthday: `[data-testid="birthday-picker-month"]` and `[data-testid="birthday-picker-year"]`
   open lists of `role="option"` buttons ("Jan", "1990"); then a "Next" button.
3. Adult learners land on `/signup/learner/over-age-gate`: `[data-testid="tos-checkbox"]`,
   inputs labelled "Email" and "Password" (min. 8 characters, not a common password), and a
   "Sign up" submit button. "Continue with Google" is also offered and is not used.

No CAPTCHA was visible up to the final step (not yet observed after submitting).

## Cookie banner

A TrustArc banner (`#truste-consent-track`) intercepts clicks on first visit. The sign-up
script clicks "Strictly Necessary Only". The extension does not need to: it fills inputs and
calls `click()` on the submit button directly, which an overlay does not block.
