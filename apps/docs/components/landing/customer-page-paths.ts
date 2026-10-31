/**
 * Paths where QRdx's own analytics (PostHog) and support widget (Featurebase)
 * must never load:
 * - pages served to QR visitors on a customer's behalf: hosted pages (/p),
 *   short-link gates (/q) and "campaign ended" pages (/ended); only pixels
 *   the page owner configured may load there;
 * - the scanner (/scan), which promises no tracking;
 * - template demos (/templates/<type>/<id>), which must look like a published
 *   page and record nothing (the /templates gallery itself is a normal page).
 */
const UNTRACKED_PATHS = ["/p", "/q", "/ended", "/scan"];
const TEMPLATE_DEMO_PATH = /^\/templates\/[^/]+\/[^/]+\/?$/;

export function isUntrackedPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return (
    TEMPLATE_DEMO_PATH.test(pathname) ||
    UNTRACKED_PATHS.some(
      (path) => pathname === path || pathname.startsWith(`${path}/`),
    )
  );
}
