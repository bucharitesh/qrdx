/**
 * The ⌘K palette's match rule: every typed word must appear in the item's
 * label or keywords (cmdk's default fuzzy match lets "domain" hit "Codes").
 * Workspace and docs results are matched on the server and force-mounted.
 */
export function paletteFilter(
  value: string,
  search: string,
  keywords?: string[],
): number {
  const haystack = `${value} ${(keywords ?? []).join(" ")}`.toLowerCase();
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  return words.every((word) => haystack.includes(word)) ? 1 : 0;
}
