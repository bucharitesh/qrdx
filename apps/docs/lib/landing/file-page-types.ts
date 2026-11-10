// Hosted page types built around files people upload (PDF, photos, audio,
// video). Where file storage isn't set up (the fileStorage availability id,
// lib/feature-availability-rules.ts), the pickers hide them: an owner
// decision, so nobody starts a page whose main block can't take an upload.
// Client-safe and tiny, so pickers can check without loading the templates.

export const FILE_PAGE_TYPES: ReadonlySet<string> = new Set([
  "pdf",
  "images",
  "mp3",
  "video",
  "playlist",
]);

/** The page types a picker offers on this deployment. */
export function offeredPageTypes<T extends { type: string }>(
  types: readonly T[],
  fileStorage: boolean,
): T[] {
  return fileStorage
    ? [...types]
    : types.filter((item) => !FILE_PAGE_TYPES.has(item.type));
}
