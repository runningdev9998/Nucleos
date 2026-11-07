/**
 * Returns a truthy marker when the rendered page shows a signed-in Khan Academy user, else null.
 * Selectors are confirmed in docs/recon.md.
 */
export function signedInAs(doc: Document): Element | null {
  const header = doc.querySelector('nav[aria-label="page header"]');
  if (!header) return null;
  if (header.querySelector('a[href="/login"], a[href^="/login?"], a[href="/signup"]')) return null;
  return header.querySelector('[data-testid="user-dropdown"], [aria-label*="profile" i]');
}
