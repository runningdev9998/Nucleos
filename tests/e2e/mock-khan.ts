import type { BrowserContext, Route } from "@playwright/test";
import { INVALID_CREDENTIALS_RESPONSE, loginFormHtml } from "../fixtures/login-form";

export const CORRECT = { username: "learner@example.com", password: "correct-horse-battery" };
export const KHAN_ERROR = "Your login or password is incorrect.";

export interface MockOptions {
  /** Whether the page after a successful login renders as signed in. */
  signedInAfterLogin?: boolean;
}

/**
 * Serves stand-ins for Khan Academy's login page, login mutation and home page at the
 * real URLs, so the extension's content scripts match exactly as they do in production.
 */
export async function mockKhanAcademy(context: BrowserContext, options: MockOptions = {}) {
  const loginRequests: Array<{ username: string; password: string }> = [];
  let signedIn = false;

  await context.route("https://www.khanacademy.org/**", async (route: Route) => {
    const url = new URL(route.request().url());

    if (url.pathname.startsWith("/api/internal/graphql/loginWithPasswordMutation")) {
      const credentials = JSON.parse(route.request().postData() ?? "{}");
      loginRequests.push(credentials);
      const ok = credentials.username === CORRECT.username && credentials.password === CORRECT.password;
      if (ok) signedIn = options.signedInAfterLogin ?? true;
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(
          ok
            ? { data: { loginWithPassword: { error: null, isFirstLogin: false, user: { id: "kaid_1", email: CORRECT.username } } } }
            : INVALID_CREDENTIALS_RESPONSE,
        ),
      });
    }

    if (url.pathname === "/login") return route.fulfill({ contentType: "text/html", body: loginPage(signedIn) });
    return route.fulfill({ contentType: "text/html", body: page(header(signedIn), "<h1>Home</h1>") });
  });

  return { loginRequests };
}

function header(signedIn: boolean): string {
  return signedIn
    ? `<nav aria-label="page header"><button data-testid="user-dropdown" aria-label="Open profile menu">Learner</button></nav>`
    : `<nav aria-label="page header"><a href="/login">Log in</a><a href="/signup">Sign up</a></nav>`;
}

function page(headerHtml: string, body: string): string {
  return `<!doctype html><html><head><title>Khan Academy</title></head><body>${headerHtml}<main>${body}</main></body></html>`;
}

/** Behaves like Khan Academy's form: posts to the login mutation, then shows the error or navigates home. */
function loginPage(signedIn: boolean): string {
  const script = `
    const form = document.querySelector("form");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const username = document.querySelector('[data-testid="identifier-field"]').value;
      const password = document.querySelector('[data-testid="password-field"]').value;
      const response = await fetch("/api/internal/graphql/loginWithPasswordMutation?hash=1&lang=en", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const body = await response.json();
      if (body.data.loginWithPassword.error) {
        const error = document.createElement("div");
        error.id = "log-in-server-error";
        error.setAttribute("role", "alert");
        error.innerHTML = '<span></span><p>${KHAN_ERROR}</p>';
        form.querySelector('[data-testid="log-in-submit-button"]').before(error);
      } else {
        location.href = "/";
      }
    });`;
  return page(header(signedIn), `${loginFormHtml()}<script>${script}</script>`);
}
