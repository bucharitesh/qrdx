// The builder's draft autosave rules (components/code-builder/drafts.ts):
// per person and workspace, at most 10, none older than 7 days, malformed
// entries dropped, blocked storage never throws.
import { describe, expect, it } from "vitest";
import {
  type CodeDraft,
  DRAFT_MAX_AGE_MS,
  draftFieldsForStorage,
  draftStorageKey,
  draftsFor,
  hasDraftableContent,
  MAX_DRAFT_STYLE_LENGTH,
  MAX_DRAFTS,
  pruneDrafts,
  readDrafts,
  removeDraft,
  upsertDraft,
  writeDrafts,
} from "@/components/code-builder/drafts";
import { EMPTY_FIELDS } from "@/components/code-builder/types";

const NOW = Date.UTC(2026, 10, 3, 12);
const draft = (id: string, savedAt: number, extra: Partial<CodeDraft> = {}) =>
  ({
    id,
    codeId: null,
    savedAt,
    fields: { ...EMPTY_FIELDS, destination: `https://example.com/${id}` },
    ...extra,
  }) satisfies CodeDraft;

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
    removeItem: (key: string) => {
      items.delete(key);
    },
  };
}

describe("draft rules", () => {
  it("keys drafts by person and workspace", () => {
    expect(draftStorageKey("u1", null)).toBe("qrdx:code-drafts:u1:personal");
    expect(draftStorageKey("u1", "org_9")).toBe("qrdx:code-drafts:u1:org_9");
  });

  it("keeps a draft only once there's a destination or a back-half", () => {
    expect(hasDraftableContent(EMPTY_FIELDS)).toBe(false);
    expect(hasDraftableContent({ ...EMPTY_FIELDS, title: "Menu" })).toBe(false);
    expect(
      hasDraftableContent({ ...EMPTY_FIELDS, destination: " a.co " }),
    ).toBe(true);
    expect(hasDraftableContent({ ...EMPTY_FIELDS, slug: "menu" })).toBe(true);
  });

  it("keeps at most 10, newest first, and drops drafts older than 7 days", () => {
    const many = Array.from({ length: 14 }, (_, index) =>
      draft(`d${index}`, NOW - index * 60_000),
    );
    const old = draft("old", NOW - DRAFT_MAX_AGE_MS - 1);
    const kept = pruneDrafts([old, ...many], NOW);
    expect(kept).toHaveLength(MAX_DRAFTS);
    expect(kept[0]?.id).toBe("d0");
    expect(kept.map((item) => item.id)).not.toContain("old");
  });

  it("drops malformed entries instead of crashing the builder", () => {
    const kept = pruneDrafts(
      [
        null,
        "draft",
        { id: "x", savedAt: NOW },
        { ...draft("bad-tags", NOW), fields: { ...EMPTY_FIELDS, tagIds: [1] } },
        draft("good", NOW),
      ],
      NOW,
    );
    expect(kept.map((item) => item.id)).toEqual(["good"]);
    expect(pruneDrafts({ not: "a list" }, NOW)).toEqual([]);
  });

  it("saves over the same session and filters by the code being edited", () => {
    const first = upsertDraft([], draft("s1", NOW - 5000), NOW);
    const again = upsertDraft(first, draft("s1", NOW), NOW);
    expect(again).toHaveLength(1);
    expect(again[0]?.savedAt).toBe(NOW);

    const mixed = [
      ...again,
      draft("edit", NOW, { codeId: "code_1" }),
      draft("other", NOW, { codeId: "code_2" }),
    ];
    expect(draftsFor(mixed, null).map((item) => item.id)).toEqual(["s1"]);
    expect(draftsFor(mixed, "code_1").map((item) => item.id)).toEqual(["edit"]);
    expect(removeDraft(mixed, "edit").map((item) => item.id)).toEqual([
      "s1",
      "other",
    ]);
  });

  it("round-trips through storage", () => {
    const storage = memoryStorage();
    const key = draftStorageKey("u1", null);
    expect(writeDrafts(storage, key, [draft("a", NOW)])).toBe(true);
    expect(readDrafts(storage, key, NOW).map((item) => item.id)).toEqual(["a"]);
    // The last draft removed clears the key.
    expect(writeDrafts(storage, key, [])).toBe(true);
    expect(storage.items.has(key)).toBe(false);
  });

  it("never throws when the browser blocks storage", () => {
    const blocked = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {
        throw new Error("SecurityError");
      },
    };
    expect(readDrafts(blocked, "k", NOW)).toEqual([]);
    expect(writeDrafts(blocked, "k", [draft("a", NOW)])).toBe(false);
    expect(readDrafts(null, "k", NOW)).toEqual([]);
    expect(writeDrafts(null, "k", [])).toBe(false);
    const corrupt = memoryStorage();
    corrupt.setItem("k", "{not json");
    expect(readDrafts(corrupt, "k", NOW)).toEqual([]);
  });

  it("leaves a large uploaded logo out of the stored draft", () => {
    const logo = `data:image/png;base64,${"A".repeat(MAX_DRAFT_STYLE_LENGTH)}`;
    const big = draftFieldsForStorage({
      ...EMPTY_FIELDS,
      style: { bodyPattern: "rounded", customLogo: logo, showLogo: true },
    });
    expect(big.logoDropped).toBe(true);
    expect(big.fields.style).toEqual({
      bodyPattern: "rounded",
      showLogo: true,
    });

    const small = draftFieldsForStorage({
      ...EMPTY_FIELDS,
      style: { customLogo: "data:image/png;base64,AAAA", showLogo: true },
    });
    expect(small.logoDropped).toBe(false);
    expect(small.fields.style?.customLogo).toBe("data:image/png;base64,AAAA");
  });
});
