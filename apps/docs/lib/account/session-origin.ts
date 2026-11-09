import {
  registerSessionOriginReader,
  type SessionOriginReader,
} from "@repo/auth/session-origin-rules";
import { scanGeo } from "@/lib/request-geo";
import { DEFAULT_NEXT_PATH, safeNextPath } from "@/lib/safe-redirect";
import { describeUserAgent } from "./sessions";

/**
 * The stolen-session check, the app's pure side (the rules are in
 * packages/auth/session-origin-rules.ts, the server side in
 * ./session-origin-server.ts). No server imports, so instrumentation.ts can
 * register the reader before the server takes requests.
 *
 * A session is held when a request on it comes from a different country AND
 * a different browser family than where it started. Held, it reads as
 * signed out everywhere except "Confirm it's you": pages in the signed-in
 * app send it to SESSION_CHECK_PATH, which asks, and gated server actions
 * answer CONFIRMATION_REQUIRED. Confirming makes where it is now its new
 * origin.
 */

/**
 * A request's browser family: the browser's and the system's names, never
 * their versions ("Chrome on macOS", the label Settings → Sessions and the
 * security emails show). Version numbers never change it, so browser and
 * system updates don't count as a different browser; switching browser, or
 * the same cookie turning up on another system, does. Scripts and API
 * clients are their product name ("curl"); no user agent is "Unknown
 * device", a family of its own, so leaving the header out doesn't hide a
 * change.
 */
export function browserFamily(userAgent: string | null): string {
  return describeUserAgent(userAgent).label;
}

/** How the app reads a request's place: the platform's country header. */
export const appSessionOriginReader: SessionOriginReader = {
  country: (headers) => scanGeo(headers).country,
  browser: browserFamily,
};

/** Hands Better Auth's side the reader (packages/auth/session-origin.ts). */
export function registerAppSessionOriginReader(): void {
  registerSessionOriginReader(appSessionOriginReader);
}

/** The page a held session's browser is sent to from the signed-in app. */
export const SESSION_CHECK_PATH = "/session-check";

/**
 * Where to go after the check: a same-site path (lib/safe-redirect), never
 * the check page itself.
 */
export function sessionCheckNext(value: unknown): string {
  const next = safeNextPath(value);
  const path = next.split(/[?#]/, 1)[0];
  return path === SESSION_CHECK_PATH ? DEFAULT_NEXT_PATH : next;
}

/** The check page, returning to `next` afterwards. */
export function sessionCheckPath(next: string): string {
  return `${SESSION_CHECK_PATH}?next=${encodeURIComponent(sessionCheckNext(next))}`;
}

export const SESSION_CHECK_MESSAGES = {
  title: "Confirm it's you",
  body: "This sign-in is being used from a different country and a different browser than where it started. Confirm it's you to keep going.",
  signedOut: "Sign in again to continue.",
  failed: "Something went wrong. Check your connection and try again.",
} as const;
