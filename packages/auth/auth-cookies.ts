// Pure: Better Auth's cookies, by name. With no cookiePrefix set (./server.ts)
// they're "better-auth.<name>" (it also reads "better-auth-<name>"), with
// "__Secure-" in front over https. The main app's proxy.ts removes them from
// a request it passes on without its session; the back-office console sends
// exactly these to the main app to ask who's signed in.

const AUTH_COOKIE = /^(?:__Secure-|__Host-)?better-auth[.-]/;

export const isAuthCookieName = (name: string) => AUTH_COOKIE.test(name);

/**
 * A Cookie header without Better Auth's cookies; null when nothing else is
 * left.
 */
export function withoutAuthCookies(cookieHeader: string): string | null {
  const kept = cookieHeader
    .split(";")
    .map((pair) => pair.trim())
    .filter((pair) => pair && !isAuthCookieName(pair.split("=", 1)[0] ?? ""));
  return kept.length > 0 ? kept.join("; ") : null;
}
