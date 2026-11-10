/**
 * Workspace logos (Settings → General), stored in organization.logo: an
 * upload in R2 under `workspace-logos/<organizationId>/<id>.<ext>` (the same
 * rules as profile pictures, lib/account/avatar.ts: the browser crops and
 * re-encodes, the server checks the bytes), or an https image URL the owner
 * typed. QRdx never fetches a typed URL on the server; browsers load it,
 * without a referrer. Client-safe.
 */

export const LOGO_PIXELS = 256;
/** After the browser's re-encode a 256 px logo is far smaller than this. */
export const LOGO_MAX_BYTES = 512 * 1024;
/** What the picker accepts before re-encoding. */
export const LOGO_INPUT_MAX_BYTES = 10 * 1024 * 1024;
export const LOGO_INPUT_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
export const LOGO_URL_MAX_LENGTH = 2048;

export const LOGO_EXTENSIONS = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
} as const;
export type LogoMime = keyof typeof LOGO_EXTENSIONS;

const PREFIX = "workspace-logos";
const ORGANIZATION_ID = /^[A-Za-z0-9_-]{1,64}$/;
const FILE = /^[a-z0-9]{16,40}\.(?:png|jpg|webp)$/;

export function workspaceLogoKey(
  organizationId: string,
  id: string,
  mime: LogoMime,
): string {
  return `${PREFIX}/${organizationId}/${id}.${LOGO_EXTENSIONS[mime]}`;
}

/** A key this feature could have written (for the serving route). */
export function isWorkspaceLogoKey(key: string): boolean {
  const [prefix, organizationId, file, ...rest] = key.split("/");
  return (
    rest.length === 0 &&
    prefix === PREFIX &&
    ORGANIZATION_ID.test(organizationId ?? "") &&
    FILE.test(file ?? "")
  );
}

/**
 * The storage key behind a logo URL when it's this workspace's upload
 * (public bucket URL or /api/workspace-logos/...), else null: typed URLs and
 * other workspaces' keys are never touched.
 */
export function workspaceLogoKeyFromUrl(
  logo: string | null | undefined,
  organizationId: string,
): string | null {
  if (!logo) return null;
  let pathname: string;
  try {
    pathname = new URL(logo).pathname;
  } catch {
    return null;
  }
  const [prefix, owner, file] = pathname.split("/").slice(-3);
  const key = `${prefix}/${owner}/${file}`;
  return owner === organizationId && isWorkspaceLogoKey(key) ? key : null;
}

/** Stands in for this site's origin when resolving a path. */
const SAME_ORIGIN = "https://same-origin.invalid";
const DATA_IMAGE = /^data:image\/[a-z0-9.+-]+[;,]/i;
const UPLOAD_ROUTE = "/api/";

/**
 * What a logo's <img> may load, or null to show the initial instead: an
 * https URL, a path on this site, or a data:image/ URL. An upload saved by a
 * server without https (local development) is an absolute http URL to its
 * own /api/workspace-logos route, so it becomes that path. Anything else
 * (other schemes, protocol-relative or plain-http URLs) is never rendered,
 * whatever got stored.
 */
export function logoImageSrc(logo: string | null | undefined): string | null {
  if (!logo) return null;
  if (DATA_IMAGE.test(logo)) return logo;
  let url: URL;
  try {
    url = new URL(logo, SAME_ORIGIN);
  } catch {
    return null;
  }
  // "//host/…" and "/\host/…" leave the site: only real paths stay on it.
  if (logo.startsWith("/")) {
    return url.origin === SAME_ORIGIN
      ? `${url.pathname}${url.search}${url.hash}`
      : null;
  }
  // Absolute URLs only from here ("logo.png" isn't one).
  if (!URL.canParse(logo)) return null;
  if (url.protocol === "https:") return url.href;
  if (
    url.protocol === "http:" &&
    url.pathname.startsWith(UPLOAD_ROUTE) &&
    isWorkspaceLogoKey(url.pathname.slice(UPLOAD_ROUTE.length))
  ) {
    return url.pathname;
  }
  return null;
}

const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const LOCAL_SUFFIXES = [".local", ".localhost", ".internal", ".home.arpa"];

/**
 * Why `value` can't be a logo URL, or null when it can: https only, a real
 * public host name (no IP addresses or local names, so a logo never makes
 * teammates' browsers call into their own network), no credentials, at most
 * 2048 characters.
 */
export function logoUrlProblem(value: string): string | null {
  if (value.length > LOGO_URL_MAX_LENGTH) return "That URL is too long.";
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "Enter a full image URL, starting with https://";
  }
  if (url.protocol !== "https:") return "Use an https:// image URL.";
  if (url.username || url.password) return "Use a URL without a password.";
  const host = url.hostname.toLowerCase();
  if (
    !host.includes(".") ||
    host.startsWith("[") ||
    IPV4.test(host) ||
    LOCAL_SUFFIXES.some((suffix) => host.endsWith(suffix))
  ) {
    return "Use an image on a public website.";
  }
  return null;
}
