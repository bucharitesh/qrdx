// Where an integration's OAuth callback may send the browser back to after the
// provider's sign-in: a path on this site only (never an open redirect). No
// server-only imports, so the checks are unit tested directly.

/** Longest return path kept (it rides in a cookie for the length of the flow). */
export const MAX_RETURN_PATH_LENGTH = 512;

const BASE = "https://return.invalid";

const hasControlOrSpace = (value: string) => {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x20 || code === 0x7f) return true;
  }
  return false;
};

/**
 * `value` as a same-site path ("/dashboard/codes?import=dub"), or null.
 * Rejects absolute and protocol-relative URLs ("https://x", "//x"), every
 * backslash (browsers read "/\x" as "//x"), whitespace and control characters
 * (URL parsing silently drops some), and anything that only becomes
 * protocol-relative once dot segments are resolved ("/.//x").
 */
export function safeReturnPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value.length === 0 || value.length > MAX_RETURN_PATH_LENGTH) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (value.includes("\\") || hasControlOrSpace(value)) return null;

  let url: URL;
  try {
    url = new URL(value, BASE);
  } catch {
    return null;
  }
  if (url.origin !== BASE) return null;

  const path = `${url.pathname}${url.search}${url.hash}`;
  return path.startsWith("//") ? null : path;
}

/**
 * The absolute URL to redirect to: `path` on `base`'s origin with `params`
 * added, or null when `path` isn't a safe return path.
 */
export function returnUrl(
  path: string | null | undefined,
  base: string | URL,
  params: Record<string, string> = {},
): URL | null {
  const safe = safeReturnPath(path);
  if (!safe) return null;
  const origin = new URL(base).origin;
  const url = new URL(safe, origin);
  if (url.origin !== origin) return null;
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url;
}
