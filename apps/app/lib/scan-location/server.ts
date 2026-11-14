import "server-only";

import { getPlanForScope, getPlanLimits } from "@/lib/plans";
import { parsePixelConfig } from "@/lib/redirect/routing";
import { LOCATION_TOKEN_TTL_SECONDS } from "./token";

/**
 * Precise scan location, opt-in per code (Pro and Business):
 *
 * 1. The owner turns on "Ask scanners for precise location" (the code's
 *    `pixels.preciseLocation`, saved by actions/code-marketing.ts).
 * 2. /q/<slug> records the scan as usual, marked `location_source = 'ip'`
 *    (asked, nothing shared yet), and hands the browser a signed token
 *    (./token.ts): redirect codes answer with the short location step
 *    (./step-page.ts), hosted pages get the token in a 15-minute cookie
 *    scoped to /p/<slug> and ask in-page (components/landing/precise-location.tsx).
 * 3. If the scanner allows it, their browser rounds the position to ~100 m
 *    and posts it with the token to /api/scan-location, which stores it on
 *    that scan (`gps`) and, for redirect codes, routes with it (geofences).
 *
 * Skipping, a browser denial, an error or a timeout store nothing more and
 * always continue. With the setting off nothing here runs: no plan lookup,
 * no extra step, no cookie.
 */

/** Cookie that carries the token from /q/<slug> to /p/<slug>. */
export const LOCATION_COOKIE = "qrdx_loc";

/** The code's owner turned the setting on (no database access). */
export const asksPreciseLocation = (pixels: unknown): boolean =>
  parsePixelConfig(pixels)?.preciseLocation === true;

/**
 * Setting on and the code's workspace on a plan with precise location. A
 * downgraded workspace stops asking (scanners are never asked for a location
 * nobody can see) until it upgrades again; its codes keep working.
 */
export async function canAskPreciseLocation(code: {
  pixels: unknown;
  userId: string;
  organizationId: string | null;
}): Promise<boolean> {
  if (!asksPreciseLocation(code.pixels)) return false;
  const plan = await getPlanForScope({
    userId: code.userId,
    organizationId: code.organizationId,
  });
  return getPlanLimits(plan).preciseLocation;
}

export function isSecureRequest(request: Request): boolean {
  return (
    new URL(request.url).protocol === "https:" ||
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https"
  );
}

const cookiePath = (slug: string) => `/p/${encodeURIComponent(slug)}`;

/** Set-Cookie for the hosted page the scan opens (HttpOnly, 15 minutes). */
export function locationCookie(
  token: string,
  slug: string,
  { secure }: { secure: boolean },
): string {
  return [
    `${LOCATION_COOKIE}=${token}`,
    `Path=${cookiePath(slug)}`,
    `Max-Age=${LOCATION_TOKEN_TTL_SECONDS}`,
    "HttpOnly",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

/** Set-Cookie that removes it once the answer is in. */
export function clearLocationCookie(
  slug: string,
  { secure }: { secure: boolean },
): string {
  return [
    `${LOCATION_COOKIE}=`,
    `Path=${cookiePath(slug)}`,
    "Max-Age=0",
    "HttpOnly",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}
