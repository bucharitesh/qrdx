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

/** A new id for a builder session (its draft). */
export function newDraftId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}
