import { BOT_CHECK_SELECTOR, LOGIN_SELECTORS } from "../../../shared/khan";

/**
 * Returns the error Khan Academy is currently showing on the login form, exactly as
 * rendered (whitespace trimmed only), or null when no error is visible.
 */
export function readKhanError(root: ParentNode = document): string | null {
  for (const selector of [LOGIN_SELECTORS.serverError, ...LOGIN_SELECTORS.fieldErrors]) {
    const element = root.querySelector<HTMLElement>(selector);
    const text = element ? visibleText(element) : "";
    if (text) return text;
  }
  return null;
}

export function hasBotCheck(root: ParentNode = document): boolean {
  return root.querySelector(BOT_CHECK_SELECTOR) !== null;
}

function visibleText(element: HTMLElement): string {
  // innerText respects rendering (hidden nodes are skipped); jsdom lacks it, so fall back.
  const text = typeof element.innerText === "string" ? element.innerText : element.textContent ?? "";
  return text.trim();
}

/** Sets a value the way a user would, so React's controlled inputs register it. */
export function fillInput(input: HTMLInputElement, value: string): void {
  input.focus();
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (setter) setter.call(input, value);
  else input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

export function waitFor<T>(
  probe: () => T | null | undefined,
  { timeoutMs, root = document }: { timeoutMs: number; root?: Node },
): Promise<T | null> {
  return new Promise((resolve) => {
    const initial = probe();
    if (initial) return resolve(initial);

    const observer = new MutationObserver(() => {
      const value = probe();
      if (value) finish(value);
    });
    const timer = setTimeout(() => finish(null), timeoutMs);
    function finish(value: T | null) {
      observer.disconnect();
      clearTimeout(timer);
      resolve(value);
    }
    observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true });
  });
}
