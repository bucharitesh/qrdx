import { baseUrl } from "@/lib/metadata";

// Photos and marks the templates use, served from public/images/templates
// (credits in CREDITS.md there). Template content stores absolute links, so a
// page created from a template keeps working on a custom domain. Never rename
// or delete a file: saved pages link to it.

export const TEMPLATE_MEDIA_PATH = "/images/templates/";

/** Absolute URL of a file in public/images/templates. */
export function templateMediaUrl(file: string): string {
  return new URL(`${TEMPLATE_MEDIA_PATH}${file}`, baseUrl).toString();
}

/** A template photo (`<name>.webp`) as an image prop. */
export function templatePhoto(name: string, alt: string) {
  return { url: templateMediaUrl(`${name}.webp`), alt };
}

/** A template logo or app icon (`<name>.svg`) as an image prop. */
export function templateMark(name: string, alt: string) {
  return { url: templateMediaUrl(`${name}.svg`), alt };
}

/**
 * The half-size copy of a template photo (`<name>.sm.webp`) for scaled-down
 * previews; other URLs are returned unchanged.
 */
export function smallTemplatePhoto(url: string): string {
  const prefix = new URL(TEMPLATE_MEDIA_PATH, baseUrl).toString();
  return url.startsWith(prefix) &&
    url.endsWith(".webp") &&
    !url.endsWith(".sm.webp")
    ? `${url.slice(0, -".webp".length)}.sm.webp`
    : url;
}
