import "server-only";
import { parseSetCookieHeader, toCookieOptions } from "better-auth/cookies";
import { cookies } from "next/headers";

/**
 * Applies the cookies an auth.api call set (`returnHeaders: true`) to the
 * server action's response. auth.api runs outside Better Auth's HTTP handler,
 * so a call that swaps the session (turning two-step verification on or off
 * signs the browser into a new session and deletes the old one) would
 * otherwise leave the browser holding a dead cookie.
 */
export async function forwardAuthCookies(
  headers: Headers | null | undefined
): Promise<void> {
  const setCookie = headers?.get("set-cookie");
  if (!setCookie) return;
  const jar = await cookies();
  for (const [name, cookie] of parseSetCookieHeader(setCookie)) {
    jar.set(name, cookie.value, toCookieOptions(cookie));
  }
}
