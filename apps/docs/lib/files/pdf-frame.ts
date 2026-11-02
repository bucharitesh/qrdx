import mediaManifest from "@/lib/media-manifest.json";
import { baseUrl } from "@/lib/metadata";
import type { FileSource } from "./source";
import { FILE_ID_PATTERN } from "./types";

/**
 * Which PDF sources a hosted page may show inline (in an <iframe>). Only
 * bytes QRdx stores and checked at upload: files uploaded to QRdx (served
 * from /api/files/<id>), links into QRdx's own public storage and the sample
 * PDFs the app ships (public/samples, used by template demos). A link to
 * any other site gets the "Open PDF" button only, since what that URL serves
 * can change at any time (an HTML login page instead of a PDF).
 *
 * The frame carries no `sandbox`: Chrome refuses to render a PDF inside any
 * sandboxed frame (it shows its "blocked" page instead), and the frames we
 * keep only ever show QRdx-stored PDFs, on the storage origin.
 */

/** Storage prefixes whose objects were never checked or were taken down. */
const UNVERIFIED_PREFIXES = ["staging/", "quarantine/"];

function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/** Public storage origins: the site media origin and R2_PUBLIC_BASE_URL (server only). */
export function storageOrigins(): string[] {
  return [
    originOf(mediaManifest.origin),
    originOf(process.env.R2_PUBLIC_BASE_URL),
  ].filter((origin): origin is string => Boolean(origin));
}

const FILE_LINK = /^\/api\/files\/([^/?#]+)\/?$/;
const SAMPLE_PDF = /^\/samples\/[a-z0-9-]+\.pdf$/;

export function isHostedPdfUrl(
  value: string,
  origins: readonly string[] = storageOrigins(),
): boolean {
  let url: URL;
  try {
    url = new URL(value, baseUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.origin !== baseUrl.origin) return false;
  if (url.username || url.password) return false;

  // A QRdx file link (/api/files/<id>) or a shipped sample, on the app's origin.
  if (url.origin === baseUrl.origin) {
    if (SAMPLE_PDF.test(url.pathname)) return true;
    const id = FILE_LINK.exec(url.pathname)?.[1];
    return Boolean(id && FILE_ID_PATTERN.test(decodeURIComponent(id)));
  }
  // A PDF in QRdx's public storage, outside upload staging and quarantine.
  if (!origins.includes(url.origin)) return false;
  const key = decodeURIComponent(url.pathname.slice(1));
  return (
    key.toLowerCase().endsWith(".pdf") &&
    !UNVERIFIED_PREFIXES.some((prefix) => key.startsWith(prefix))
  );
}

/** True when the block may show `source` in an inline frame. */
export function canFramePdf(
  source: FileSource | null | undefined,
  origins?: readonly string[],
): boolean {
  if (!source) return false;
  if (source.type === "file") return true;
  return isHostedPdfUrl(source.url, origins);
}
