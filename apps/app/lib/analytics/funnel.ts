// The funnel's client-side steps as pure decisions (no React, no browser
// globals), used by the hooks in ./react.tsx: when an editor opening, a QR
// code or a barcode counts. Client-safe.

import type { EditorSurface } from "@repo/analytics/events";
import { handoffSource } from "@/lib/playground-links";
import { isUntrackedAnalyticsPath } from "./privacy";

/**
 * Where an editor was opened from (editor_opened's `source`): the link's
 * `ref` tag, else the previous page of this tab's visit (an in-app link
 * doesn't change document.referrer), else the document's referrer. A name,
 * never an address: "direct", "external", a site section or a tag.
 */
export function editorOpenSource(page: {
  href: string;
  referrer: string;
  /** The tab's previous pathname (lib/navigation-history.ts), if any */
  previousPath: string | null;
}): string {
  const url = new URL(page.href);
  const referrer =
    page.previousPath && !isUntrackedAnalyticsPath(page.previousPath)
      ? new URL(page.previousPath, url.origin).href
      : page.referrer;
  return handoffSource(referrer, url.origin, url.searchParams.get("ref"));
}

/** editor_opened's properties for `surface`, opened at `page`. */
export function editorOpenedProps(
  surface: EditorSurface,
  page: Parameters<typeof editorOpenSource>[0],
): { surface: EditorSurface; source: string } {
  return { surface, source: editorOpenSource(page) };
}

/**
 * Whether content typed into a live editor counts as a generated code
 * (qr_generated): it isn't empty, isn't what the page opened with, isn't a
 * value QRdx put there itself (a dynamic code's short link), and this
 * content type hasn't counted yet in this visit.
 */
export function countsAsGenerated(input: {
  content: string | null | undefined;
  initial: string | null | undefined;
  contentType: string;
  counted: ReadonlySet<string>;
  programmatic: ReadonlySet<string>;
}): boolean {
  const { content } = input;
  if (!content?.trim() || content === input.initial) return false;
  if (input.programmatic.has(content)) return false;
  return !input.counted.has(input.contentType);
}

/**
 * Whether a barcode counts as generated (barcode_generated): it rendered,
 * its value or symbology isn't what the page opened with, and this
 * symbology hasn't counted yet in this visit.
 */
export function countsAsBarcode(input: {
  rendered: boolean;
  symbology: string;
  value: string;
  initial: { symbology: string; value: string };
  counted: ReadonlySet<string>;
}): boolean {
  if (!(input.rendered && input.value.trim())) return false;
  if (
    input.symbology === input.initial.symbology &&
    input.value === input.initial.value
  ) {
    return false;
  }
  return !input.counted.has(input.symbology);
}
