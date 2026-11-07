export type ToastKind = "error" | "success" | "info";

const HOST_ID = "ka-auto-signin-toast";
const COLORS: Record<ToastKind, string> = { error: "#b3261e", success: "#1b7f3b", info: "#3b4a63" };

/**
 * Shows a toast inside a shadow root so page styles cannot restyle or hide it.
 * Text is assigned with textContent, so Khan Academy's message is shown verbatim and never parsed as HTML.
 */
export function showToast(kind: ToastKind, title: string, message: string, doc: Document = document): HTMLElement {
  doc.getElementById(HOST_ID)?.remove();

  const host = doc.createElement("div");
  host.id = HOST_ID;
  host.dataset.kind = kind;
  const shadow = host.attachShadow({ mode: "open" });

  const style = doc.createElement("style");
  style.textContent = `
    .toast { position: fixed; top: 16px; right: 16px; z-index: 2147483647; max-width: 380px;
      padding: 12px 16px; border-radius: 8px; color: #fff; background: ${COLORS[kind]};
      font: 14px/1.4 system-ui, sans-serif; box-shadow: 0 6px 20px rgba(0,0,0,.25); }
    .title { font-weight: 600; margin-bottom: 4px; }
    button { position: absolute; top: 6px; right: 8px; border: 0; background: none; color: inherit;
      font-size: 16px; cursor: pointer; }`;

  const toast = doc.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", kind === "error" ? "alert" : "status");

  const titleEl = doc.createElement("div");
  titleEl.className = "title";
  titleEl.textContent = title;

  const messageEl = doc.createElement("div");
  messageEl.className = "message";
  messageEl.dataset.testid = "toast-message";
  messageEl.textContent = message;

  const close = doc.createElement("button");
  close.type = "button";
  close.setAttribute("aria-label", "Dismiss");
  close.textContent = "×";
  close.addEventListener("click", () => host.remove());

  toast.append(titleEl, messageEl, close);
  shadow.append(style, toast);
  (doc.body ?? doc.documentElement).append(host);
  return host;
}
