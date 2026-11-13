import { splitLocale } from "@/lib/i18n/paths";

/**
 * Paths where QRdx's own analytics (PostHog) and support widget (Featurebase)
 * must never load:
 * - pages served to QR visitors on a customer's behalf: hosted pages (/p),
 *   short-link gates (/q) and "campaign ended" pages (/ended); only pixels
 *   the page owner configured may load there;
 * - the scanner (/scan), which promises no tracking;
 * - template demos (/templates/<type>/<id>), which must look like a published
 *   page and record nothing (the /templates gallery itself is a normal page);
 * - public analytics pages (/stats/<token>), shared by a code's owner: the
 *   token in the path is the page's only key;
 * - client portals (/portal/<workspace>, agency tools): a workspace's
 *   white-label view for its clients.
 */
const UNTRACKED_PATHS = ["/p", "/q", "/ended", "/scan", "/stats", "/portal"];

// Translated pages (/es/scan) count as their English path (lib/i18n/paths.ts).
const TEMPLATE_DEMO_PATH = /^\/templates\/[^/]+\/[^/]+\/?$/;

export function isUntrackedPath(pathname: string | null): boolean {
  if (!pathname) return false;
  const { path } = splitLocale(pathname);
  return (
    TEMPLATE_DEMO_PATH.test(path) ||
    UNTRACKED_PATHS.some(
      (untracked) => path === untracked || path.startsWith(`${untracked}/`),
    )
  );
}
