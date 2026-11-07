/** Masks an email or username for logs: "jane@example.com" becomes "j***@example.com". */
export function maskEmail(value: string): string {
  const at = value.indexOf("@");
  if (at <= 0) return value.length <= 2 ? "*".repeat(value.length) : `${value[0]}***${value.at(-1)}`;
  return `${value[0]}***${value.slice(at)}`;
}
