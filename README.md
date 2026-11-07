# Khan Academy onboarding script and auto sign-in extension

Nucleos Senior Software Engineer take-home.

- **`onboarding/`** is a Playwright script that creates one free Khan Academy adult learner account with an email and password. It reports that the account exists only after proving it.
- **`extension/`** is a Chrome Manifest V3 extension. When you open the Khan Academy login page, it signs in once with credentials from a config file. It then shows either Khan Academy's own error, word for word, or a confirmed success.

**Recording:** _link to be added_

## Requirements

- Node.js 20 or newer (developed on Node 24).
- Google Chrome, for loading the extension.

```sh
npm install
npx playwright install chromium
```

## 1. Onboarding script

```sh
cp .env.example .env        # then set KA_EMAIL
npm run signup              # opens a visible Chromium window
```

The script:
- opens `/signup`;
- chooses **Student**;
- enters an adult birthday (Jan 1990);
- accepts the terms;
- fills in the email and a generated 20-character password;
- submits.

Before submitting, it saves the credentials to `.credentials.local.json`, which is git-ignored, so a crash after Khan Academy creates the account can't lose the password. It never prints the password and masks the email in its output (`j***@example.com`).

It ends with one of these results:

| Result | Exit code | Meaning |
| --- | --- | --- |
| `ACCOUNT CREATED` | 0 | Proven, see below. |
| `NOT CREATED` | 1 | Khan Academy rejected the sign-up (its message is printed), or the new credentials don't sign in. |
| `UNPROVEN` | 2 | Something stopped the script before it could prove the account exists, for example an unsolved bot check or no response. |

Options:
- `--verify-only` re-checks the saved account without creating a new one.
- `--headless` runs without a visible window. Any bot check then ends the run as `UNPROVEN`, because nobody is there to solve it.

**One account only.** The script refuses to run if `.credentials.local.json` holds a verified account, or a submitted one that hasn't been verified yet (use `--verify-only` for that case). Only a recorded failure allows a second sign-up.

**Bot checks.** If a CAPTCHA appears, the script waits up to five minutes for a person to solve it in the window. It never tries to solve or bypass one.

### How I know the account was created

Reaching the page after sign-up isn't treated as proof. After submitting, the script opens a new browser context that shares no cookies with the sign-up session and signs in with the new credentials. The account counts as created only if all of these hold:
- Khan Academy's `loginWithPasswordMutation` response contains a `user` and no `error`;
- the returned user matches the new email, whenever the response includes an identifying field.

## 2. Extension

### Load it

```sh
npm run build               # writes extension/dist/
```

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and select `extension/dist`.
3. Open <https://www.khanacademy.org/login>.

### Set the credentials

`npm run build` copies the config into `extension/dist/config.json`:
- If `extension/config.local.json` exists (git-ignored), that file is used.
- Otherwise the build uses `extension/config.example.json`, which is committed and **deliberately wrong** (`…@example.invalid`), so the first run fails.

To switch to the real account:

```sh
cp extension/config.example.json extension/config.local.json
# put the account's email and password in config.local.json
npm run build
# chrome://extensions → reload the extension, then reload the login page
```

Quicker for a demo: edit `extension/dist/config.json` directly and reload the extension.

### What it does

1. **Detection.** On `https://www.khanacademy.org/login` only, it waits for the login form. On other Khan Academy pages it does nothing, with one exception: if this tab just made a sign-in that Khan Academy accepted, the next page confirms it. It does nothing on any other site.
2. **Sign-in.** It fills the email and password in a way React registers, then clicks **Log in**.
3. **Failure.** It reads the error Khan Academy renders (`#log-in-server-error`, or the field error elements) using the rendered text unchanged. It shows that text in a toast and logs it to the page console and the service worker console:
   `[KA Auto Sign-in] Sign-in failed. Khan Academy said: "Your login or password is incorrect."`
4. **Success.** It shows a green toast and logs `Signed in to Khan Academy as …` only when proven, as described below.
5. **Anything else** shows an "outcome unknown" toast with the reason. That covers a bot check, no response, a rejection with no visible message, or an accepted sign-in the next page doesn't reflect. It never guesses.
6. **One attempt per visit.** It makes at most one attempt per arrival on `/login`. A rejected sign-in leaves you on the page and it doesn't retry; reloading counts as a new visit. After **three failures in a row** in a browser session it stops trying and says so, because repeated failures can lock an account.

### How I know a sign-in succeeded

Two independent signals must agree:
1. **Khan Academy's own answer.** A small observer runs in the page at `document_start` and reads the `loginWithPasswordMutation` response without altering it. The response must contain a `user` and no `error`, and that user must match the configured account when it includes an email or username.
2. **The resulting page.** The page Khan Academy navigates to afterwards must show a signed-in user in its header.

If only the first holds, the toast says the outcome is unknown.

I didn't use a "who am I" API call because Khan Academy only accepts safelisted GraphQL queries; ad-hoc queries return `403 Operation not found in safelist` (see [`docs/recon.md`](docs/recon.md)).

### Permissions

| Permission | Why |
| --- | --- |
| `content_scripts` on `https://www.khanacademy.org/*` | Needed to find and fill the login form, and to confirm a sign-in on the page Khan Academy redirects to. No other site is matched. No `host_permissions` are requested, because the extension makes no cross-origin requests. |
| `storage` | `chrome.storage.session` keeps two small pieces of state that must survive page navigation and service worker restarts: a just-accepted sign-in waiting for the next page to confirm it, and the consecutive-failure count. Session storage is in memory and cleared when the browser closes. |

No `tabs`, `scripting`, `cookies`, `webRequest`, or `<all_urls>`.

The config is read by the service worker from the extension's own package, so it isn't listed in `web_accessible_resources` and Khan Academy's pages can't fetch it.

## Design decisions

- **Evidence over assumptions.** Each part reports success only from Khan Academy's own response plus an independent check. Everything else is a failure with Khan Academy's message, or "unknown" with a reason.
- **The error text is never written by me.** The toast takes the rendered text of Khan Academy's error element and sets it with `textContent`, so it's shown exactly as written and never parsed as HTML.
- **Two content scripts.**
  - The `MAIN`-world observer exists only because isolated content scripts can't see the page's `fetch` responses. It forwards one message type to the content script and nothing else.
  - All logic, DOM work and UI live in the isolated content script.
- **The toast lives in a shadow root**, so Khan Academy's CSS can't hide or restyle it.
- **The demo config can't hurt a real account.** The wrong example uses a non-existent `.invalid` address, so failed demo runs never count against the real account.
- **Shared code.** Selectors and the login-response classifier are in `shared/` and used by both the script and the extension.

## Tests

```sh
npm test            # 57 unit tests (Vitest; jsdom for DOM code)
npm run test:e2e    # builds the extension, then 6 Playwright tests with the real extension loaded
npm run test:all    # typecheck + both
```

- **Unit tests** cover:
  - the login-response classifier (including Khan Academy's real error response, captured during recon);
  - error extraction from a copy of Khan Academy's real form markup;
  - the outcome logic: error before or after the response, rejection with no message, a contradictory success, bot check, timeout;
  - config validation and that the shipped example values are fake;
  - the failure cap, identity matching and masking;
  - the toast showing text verbatim (no HTML injection);
  - password generation and the one-account guard.
- **End-to-end tests** load the built extension in Chromium and serve stand-in Khan Academy pages at the real URLs, so they never hit the real site. They cover:
  - the exact error toast and log;
  - a confirmed success;
  - an accepted sign-in that isn't reported as success when the next page isn't signed in;
  - one attempt per visit, including after a reload;
  - the three-failure stop;
  - doing nothing on other pages.

## Known limitations

- **Markup changes.** The extension and script depend on Khan Academy's current markup (`data-testid`s, `#log-in-server-error`) and on the `loginWithPasswordMutation` name. If they change, the result becomes "unknown", never a false success. A nightly smoke test against the real site would catch it.
- **Config needs a rebuild or edit.** Credentials are bundled into the unpacked extension, so changing them means a rebuild or editing `dist/config.json` and reloading. An options page backed by `chrome.storage.local` would be friendlier.
- **Signed-in detection is a page check.** Confirming the signed-in header relies on page structure, because there's no safelisted "who am I" query the extension can call.
- **Page scripts could spoof the observer.** The observer messages the content script with `window.postMessage`, which Khan Academy's own scripts could imitate. That's acceptable for this threat model; a stricter version would use a per-load nonce.
- **The sign-up script is browser-driven** and only covers the email and password learner path.

## What I'd do next with more time

- An options page for credentials, using `chrome.storage.local`.
- A scheduled, read-only smoke test against the real login page that alerts on selector drift.
- Per-load nonce authentication between the page observer and the content script.
- Running the extension end-to-end tests in CI.

## AI tools

I used Cursor's agent (Claude) to:
- explore Khan Academy's login and sign-up pages;
- draft the code, tests and this README.

I reviewed and can explain every line.
