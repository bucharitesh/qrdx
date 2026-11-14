/**
 * Which site a pasted or typed address is on, decided by its parsed hostname.
 * Looking for "youtube.com" anywhere in the text would also accept
 * "evil.example/?youtube.com" and "youtube.com.evil.example".
 */

import { normalizeWebUrl } from "@/utils/qr-content-encoder";

/**
 * The address as a URL when it is http(s), else null. A value without a
 * scheme ("instagram.com/name") is read as https, as browsers do.
 */
export function parseWebUrl(value: string): URL | null {
  const normalized = normalizeWebUrl(value);
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/** True when the URL's host is one of `domains` or a subdomain of one. */
export function isOnDomain(url: URL | null, ...domains: string[]): boolean {
  if (!url) return false;
  const host = url.hostname.replace(/\.$/, "");
  return domains.some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );
}

/** Amazon's stores: amazon.com, amazon.de, amazon.co.uk, amazon.com.au, ... */
const AMAZON_HOST =
  /(?:^|\.)amazon\.(?:com|co\.[a-z]{2}|com\.[a-z]{2}|[a-z]{2})$/;

export function isAmazonUrl(url: URL | null): boolean {
  return url !== null && AMAZON_HOST.test(url.hostname.replace(/\.$/, ""));
}

/** A Drive file, or a Docs, Sheets, Slides or Drawings document. */
export function isGoogleDriveFileUrl(url: URL | null): boolean {
  return (
    isOnDomain(url, "drive.google.com") ||
    (isOnDomain(url, "docs.google.com") &&
      /^\/(document|spreadsheets|presentation|drawings)\/d\//.test(
        url?.pathname ?? "",
      ))
  );
}
