// Draft rules: drafts live only in this browser (localStorage), at most 10
// per workspace, none older than 7 days.
// Pure: the storage comes in as an argument, so it's testable without a DOM.

import type { QRStyle } from "@/types/theme";
import type { BuilderFields } from "./types";

export const MAX_DRAFTS = 10;
export const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** A change is saved this long after typing stops (closing saves at once). */
export const DRAFT_DEBOUNCE_MS = 1000;

export interface CodeDraft {
  /** One per builder session; restoring a draft continues it */
  id: string;
  /** The code being edited; null for a new code */
  codeId: string | null;
  savedAt: number;
  fields: BuilderFields;
}

/** Per person and workspace, so a team's drafts never show in Personal. */
export function draftStorageKey(
  userId: string,
  workspaceId: string | null,
): string {
  return `qrdx:code-drafts:${userId}:${workspaceId ?? "personal"}`;
}

/**
 * An uploaded logo is an inline data URL of up to ~1.4MB; ten of those would
 * fill the browser's storage, so drafts keep a large one out.
 */
export const MAX_DRAFT_STYLE_LENGTH = 100_000;

/** The fields as a draft stores them (a large uploaded logo left out). */
export function draftFieldsForStorage(fields: BuilderFields): {
  fields: BuilderFields;
  logoDropped: boolean;
} {
  const style = fields.style;
  if (
    !style?.customLogo ||
    JSON.stringify(style).length <= MAX_DRAFT_STYLE_LENGTH
  ) {
    return { fields, logoDropped: false };
  }
  const { customLogo: _logo, ...rest } = style;
  return { fields: { ...fields, style: rest }, logoDropped: true };
}

/** Worth keeping: there's a destination or a back-half. */
export function hasDraftableContent(fields: BuilderFields): boolean {
  return Boolean(fields.destination.trim() || fields.slug.trim());
}

const isString = (value: unknown): value is string => typeof value === "string";

/** A stored draft as it was written, or null for anything else. */
function parseDraft(value: unknown): CodeDraft | null {
  if (!value || typeof value !== "object") return null;
  const draft = value as Record<string, unknown>;
  const fields = draft.fields as Record<string, unknown> | undefined;
  if (
    !isString(draft.id) ||
    !(draft.codeId === null || isString(draft.codeId)) ||
    typeof draft.savedAt !== "number" ||
    !Number.isFinite(draft.savedAt) ||
    !fields ||
    typeof fields !== "object" ||
    !isString(fields.destination) ||
    !isString(fields.title) ||
    !(fields.domainId === null || isString(fields.domainId)) ||
    !isString(fields.slug) ||
    !(fields.folderId === null || isString(fields.folderId)) ||
    !Array.isArray(fields.tagIds) ||
    !fields.tagIds.every(isString) ||
    !(
      fields.style === null ||
      (typeof fields.style === "object" && !Array.isArray(fields.style))
    )
  ) {
    return null;
  }
  return {
    id: draft.id,
    codeId: draft.codeId,
    savedAt: draft.savedAt,
    fields: {
      destination: fields.destination,
      title: fields.title,
      domainId: fields.domainId,
      slug: fields.slug,
      folderId: fields.folderId,
      tagIds: [...fields.tagIds],
      style: fields.style as QRStyle | null,
    },
  };
}

/** Drops malformed and expired drafts; newest first, at most MAX_DRAFTS. */
export function pruneDrafts(value: unknown, now: number): CodeDraft[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(parseDraft)
    .filter(
      (draft): draft is CodeDraft =>
        draft !== null &&
        draft.savedAt <= now &&
        now - draft.savedAt < DRAFT_MAX_AGE_MS,
    )
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, MAX_DRAFTS);
}

/** Saves `draft` over the one with its id. */
export function upsertDraft(
  drafts: CodeDraft[],
  draft: CodeDraft,
  now: number,
): CodeDraft[] {
  return pruneDrafts(
    [draft, ...drafts.filter((item) => item.id !== draft.id)],
    now,
  );
}

export function removeDraft(drafts: CodeDraft[], id: string): CodeDraft[] {
  return drafts.filter((draft) => draft.id !== id);
}

/** Drafts of the code being edited, or of new codes. */
export function draftsFor(
  drafts: CodeDraft[],
  codeId: string | null,
): CodeDraft[] {
  return drafts.filter((draft) => draft.codeId === codeId);
}

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Stored drafts; empty when storage is blocked or holds something else. */
export function readDrafts(
  storage: DraftStorage | null,
  key: string,
  now: number,
): CodeDraft[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(key);
    return raw ? pruneDrafts(JSON.parse(raw), now) : [];
  } catch {
    return [];
  }
}

/** False when the browser refused (private mode, quota, blocked storage). */
export function writeDrafts(
  storage: DraftStorage | null,
  key: string,
  drafts: CodeDraft[],
): boolean {
  if (!storage) return false;
  try {
    if (drafts.length === 0) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(drafts));
    return true;
  } catch {
    return false;
  }
}

/** The browser's localStorage, or null where reading it throws. */
export function browserStorage(): DraftStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
