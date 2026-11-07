import { graphqlOperationName, LOGIN_MUTATION } from "../../shared/khan";
import { PAGE_MESSAGE_SOURCE, type LoginResponseMessage } from "./lib/messages";

// Runs in the page's own JavaScript world at document_start, before Khan Academy's
// bundle keeps a reference to fetch. It only reads login responses; it never alters them.
const originalFetch = window.fetch;

window.fetch = async function (this: unknown, ...args: Parameters<typeof fetch>) {
  const response = await originalFetch.apply(this, args);
  const url = args[0] instanceof Request ? args[0].url : String(args[0]);
  if (graphqlOperationName(url) === LOGIN_MUTATION) {
    response
      .clone()
      .json()
      .catch(() => null)
      .then((body: unknown) => {
        const message: LoginResponseMessage = {
          source: PAGE_MESSAGE_SOURCE,
          type: "login-response",
          status: response.status,
          body,
        };
        window.postMessage(message, window.location.origin);
      });
  }
  return response;
};
