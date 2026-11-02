// Where to send a visitor after sign-in. `next` comes from the query string, so
// it is untrusted: only a path on this site is accepted, never another origin
// (an open redirect). No imports, so the proxy, pages and tests share it.

/** The sign-in page (app/(auth)/sign-in). */
export const SIGN_IN_PATH = "/sign-in";

/** Where sign-in lands when `next` is missing or rejected. */
export const DEFAULT_NEXT_PATH = "/dashboard";

const MAX_NEXT_LENGTH = 2048;
const PARSE_BASE = "https://same-origin.invalid";

function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * `value` when it is a same-origin relative path ("/settings/developers?x=1"),
 * otherwise `fallback`. Rejects absolute and protocol-relative URLs ("//host",
 * "/\host"), backslashes anywhere (browsers read them as "/"), whitespace and
 * control characters (browsers strip tabs and newlines, which can turn "/\t/"
 * into "//"), and the sign-in page itself (a loop).
 */
export function safeNextPath(
  value: unknown,
  fallback: string = DEFAULT_NEXT_PATH,
): string {
  if (typeof value !== "string") return fallback;
  if (value.length === 0 || value.length > MAX_NEXT_LENGTH) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  // Backslashes, whitespace, C0 controls and DEL.
  if (/[\\\s]/.test(value) || hasControlCharacter(value)) return fallback;

  let url: URL;
  try {
    url = new URL(value, PARSE_BASE);
  } catch {
    return fallback;
  }
  if (url.origin !== PARSE_BASE) return fallback;
  if (
    url.pathname === SIGN_IN_PATH ||
    url.pathname.startsWith(`${SIGN_IN_PATH}/`)
  )
    return fallback;
  return value;
}

/** The sign-in page, returning to `next` (when it is a safe path) after. */
export function signInPath(next?: string): string {
  const target = safeNextPath(next, "");
  return target
    ? `${SIGN_IN_PATH}?next=${encodeURIComponent(target)}`
    : SIGN_IN_PATH;
}
