// The codes list shows a save from the builder at once instead of waiting
// for the page to refresh: an edit as soon as Save is pressed (undone if it
// fails), a new code as soon as the server returns it. The server's list
// takes over on the next refresh. Pure, so it's tested without React.

import type {
  QrCodeListItem,
  QrCodeView,
} from "@/app/dashboard/codes/_lib/qr-codes";

export type OptimisticPatch = Partial<
  Pick<QrCodeListItem, "title" | "destinationUrl" | "style" | "folderId">
>;

export type OptimisticEntry =
  | {
      key: string;
      kind: "update";
      codeId: string;
      patch: OptimisticPatch;
      /** Date.now() when the save finished; null while it runs */
      settledAt: number | null;
    }
  | {
      key: string;
      kind: "create";
      code: QrCodeListItem;
      settledAt: number;
    };

/** A list row for a code the builder just created. */
export function listItemFromView(
  code: QrCodeView,
  extra: { folderId: string | null; tags: QrCodeListItem["tags"] },
): QrCodeListItem {
  return {
    ...code,
    folderId: extra.folderId,
    isFavorite: false,
    notes: null,
    pausedAt: null,
    deletedAt: null,
    tags: extra.tags,
  };
}

/**
 * The list with pending edits applied and new codes on top. New codes only
 * join a list that would show them first (all active codes, newest first,
 * page one), so a filtered view never shows a code that doesn't match it.
 */
export function mergeOptimisticCodes(
  codes: QrCodeListItem[],
  entries: OptimisticEntry[],
  { acceptNew }: { acceptNew: boolean },
): QrCodeListItem[] {
  if (entries.length === 0) return codes;
  const patches = new Map<string, OptimisticPatch>();
  for (const entry of entries) {
    if (entry.kind !== "update") continue;
    patches.set(entry.codeId, {
      ...patches.get(entry.codeId),
      ...entry.patch,
    });
  }
  const known = new Set(codes.map((code) => code.id));
  const created = acceptNew
    ? entries
        .filter(
          (entry): entry is Extract<OptimisticEntry, { kind: "create" }> =>
            entry.kind === "create" && !known.has(entry.code.id),
        )
        .sort((a, b) => b.settledAt - a.settledAt)
        .map((entry) => entry.code)
    : [];
  const patched =
    patches.size === 0
      ? codes
      : codes.map((code) => {
          const patch = patches.get(code.id);
          return patch ? { ...code, ...patch } : code;
        });
  return created.length === 0 ? patched : [...created, ...patched];
}

/**
 * Entries the list no longer needs: saves that finished before this list
 * arrived from the server (the refresh after a save carries it).
 */
export function settledKeys(
  entries: OptimisticEntry[],
  receivedAt: number,
): string[] {
  return entries
    .filter((entry) => entry.settledAt !== null && entry.settledAt < receivedAt)
    .map((entry) => entry.key);
}
