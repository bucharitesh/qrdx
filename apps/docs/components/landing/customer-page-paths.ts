/**
 * Paths where QRdx's own analytics (PostHog) and support widget (Featurebase)
 * must never load:
 * - pages served to QR visitors on a customer's behalf: hosted pages (/p),
 *   short-link gates (/q) and "campaign ended" pages (/ended); only pixels
 *   the page owner configured may load there;
 * - the scanner (/scan), which promises no tracking.
 */
const UNTRACKED_PATHS = ["/p", "/q", "/ended", "/scan"];

export function isUntrackedPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return UNTRACKED_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}
