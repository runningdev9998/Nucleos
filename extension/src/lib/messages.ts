import type { ConfigResult } from "./config";

export type Outcome =
  | { kind: "failure"; message: string; code?: string }
  | { kind: "success"; account: string }
  | { kind: "unknown"; reason: string };

/** A sign-in Khan Academy accepted, waiting to be confirmed on the page that loads next. */
export interface PendingSuccess {
  account: string;
  recordedAt: number;
}

export type Request =
  | { type: "get-config" }
  | { type: "begin-attempt" }
  | { type: "record-outcome"; outcome: Outcome }
  | { type: "record-pending-success"; pending: PendingSuccess }
  | { type: "take-pending-success" };

export interface BeginAttemptResponse {
  allowed: boolean;
  reason?: string;
}

export interface ResponseFor {
  "get-config": ConfigResult;
  "begin-attempt": BeginAttemptResponse;
  "record-outcome": null;
  "record-pending-success": null;
  "take-pending-success": PendingSuccess | null;
}

export async function send<T extends Request>(request: T): Promise<ResponseFor[T["type"]]> {
  return chrome.runtime.sendMessage(request);
}

/** Message the page-world observer posts to the content script. */
export const PAGE_MESSAGE_SOURCE = "ka-auto-signin";

export interface LoginResponseMessage {
  source: typeof PAGE_MESSAGE_SOURCE;
  type: "login-response";
  status: number;
  body: unknown;
}

export function isLoginResponseMessage(data: unknown): data is LoginResponseMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as LoginResponseMessage).source === PAGE_MESSAGE_SOURCE &&
    (data as LoginResponseMessage).type === "login-response"
  );
}
