"use client";

import { useCallback, useEffect, useState } from "react";
import {
  browserStorage,
  type CodeDraft,
  draftStorageKey,
  draftsFor,
  readDrafts,
  removeDraft,
  upsertDraft,
  writeDrafts,
} from "./drafts";

/**
 * This browser's builder drafts for one person and workspace, filtered to
 * the code being edited (or to new codes). Every write re-reads storage
 * first, so a draft saved in another tab isn't lost.
 */
export function useCodeDrafts({
  userId,
  workspaceId,
  codeId,
}: {
  /** null while the session loads: no drafts yet */
  userId: string | null;
  workspaceId: string | null;
  codeId: string | null;
}) {
  const key = userId ? draftStorageKey(userId, workspaceId) : null;
  const [all, setAll] = useState<CodeDraft[]>([]);

  useEffect(() => {
    setAll(key ? readDrafts(browserStorage(), key, Date.now()) : []);
  }, [key]);

  /** False when the browser refused to store it. */
  const save = useCallback(
    (draft: CodeDraft): boolean => {
      if (!key) return false;
      const storage = browserStorage();
      const now = Date.now();
      const next = upsertDraft(readDrafts(storage, key, now), draft, now);
      setAll(next);
      return writeDrafts(storage, key, next);
    },
    [key],
  );

  const remove = useCallback(
    (id: string) => {
      if (!key) return;
      const storage = browserStorage();
      const next = removeDraft(readDrafts(storage, key, Date.now()), id);
      setAll(next);
      writeDrafts(storage, key, next);
    },
    [key],
  );

  return { drafts: draftsFor(all, codeId), save, remove };
}

/** A new id for a builder session (its draft): a random UUID. */
export function newDraftId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    // randomUUID needs a secure context (https or localhost), so build the
    // same version 4 UUID from getRandomValues, which works everywhere.
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
}
