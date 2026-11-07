export interface Credentials {
  username: string;
  password: string;
}

export type ConfigResult = { ok: true; credentials: Credentials } | { ok: false; error: string };

export function parseConfig(raw: unknown): ConfigResult {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "config.json must contain a JSON object" };
  }
  const { username, password } = raw as Record<string, unknown>;
  if (typeof username !== "string" || username.trim() === "") {
    return { ok: false, error: 'config.json needs a non-empty "username"' };
  }
  if (typeof password !== "string" || password === "") {
    return { ok: false, error: 'config.json needs a non-empty "password"' };
  }
  return { ok: true, credentials: { username: username.trim(), password } };
}
