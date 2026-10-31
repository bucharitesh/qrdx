/** Which registry slugs implement which capability. Client-safe. */

export const SHORT_LINK_PROVIDERS = ["bitly", "rebrandly", "short-io"] as const;
export const FILE_PICKER_PROVIDERS = [
  "dropbox",
  "onedrive",
  "box",
  "notion",
] as const;

export type ShortLinkProviderSlug = (typeof SHORT_LINK_PROVIDERS)[number];
export type FilePickerProviderSlug = (typeof FILE_PICKER_PROVIDERS)[number];

export function isShortLinkProvider(
  slug: string
): slug is ShortLinkProviderSlug {
  return (SHORT_LINK_PROVIDERS as readonly string[]).includes(slug);
}

export function isFilePickerProvider(
  slug: string
): slug is FilePickerProviderSlug {
  return (FILE_PICKER_PROVIDERS as readonly string[]).includes(slug);
}

/** Short-link providers that let you type the back-half (slug). */
export const SLUG_SUPPORT: Record<ShortLinkProviderSlug, boolean> = {
  bitly: false,
  rebrandly: true,
  "short-io": true,
};
