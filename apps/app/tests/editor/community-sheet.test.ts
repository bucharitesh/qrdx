// The editor's community sheet (components/editor/community-sheet.tsx): a
// community theme replaces the look as one undo step and keeps the content;
// search runs over loaded themes; likes go through the v1 reaction action
// (mocked here: nothing reaches a database) with an optimistic count that a
// refusal puts back; a like asked for while signed out ends up liked after
// signing in; and "Publish this style" signs in, saves first or opens the
// publish dialog.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// The editor and auth stores persist to window.localStorage, which Node
// doesn't have.
vi.hoisted(() => {
  const items = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      clear: () => items.clear(),
      getItem: (key: string) => items.get(key) ?? null,
      removeItem: (key: string) => items.delete(key),
      setItem: (key: string, value: string) => items.set(key, String(value)),
    },
  });
});

// Server actions: mocked, so no test ever writes (or reads) a database.
vi.mock("@/actions/community", () => ({ toggleCommunityLike: vi.fn() }));
vi.mock("@/actions/community-themes", () => ({
  getCommunityThemes: vi.fn(),
  getCommunityTagCounts: vi.fn(),
  getMyPublishedThemeIds: vi.fn(),
  publishTheme: vi.fn(),
  toggleLikeTheme: vi.fn(),
  unpublishTheme: vi.fn(),
  updateCommunityThemeTags: vi.fn(),
}));
vi.mock("@/actions/qr-themes", () => ({
  getThemes: vi.fn(),
  getTheme: vi.fn(),
  createTheme: vi.fn(),
  updateTheme: vi.fn(),
  deleteTheme: vi.fn(),
}));
vi.mock("@repo/auth/client", () => ({
  authClient: { useSession: () => ({ data: null, isPending: false }) },
}));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));

const { toggleCommunityLike } = await import("@/actions/community");
const {
  applyCommunityTheme,
  communityLook,
  ensureLiked,
  isLikeable,
  matchesSearch,
  publishStep,
  runLike,
  searchTokens,
  uniqueThemes,
  withLike,
} = await import("@/components/editor/community-sheet");
const { defaultThemeState } = await import("@/config/qr");
const { useQREditorStore } = await import("@/store/editor-store");

import type { CommunityTheme } from "@/types/community";
import type { ThemeStyles } from "@/types/theme";

afterAll(() => {
  vi.unstubAllGlobals();
});

const toggle = vi.mocked(toggleCommunityLike);
const editor = () => useQREditorStore.getState();

function theme(overrides: Partial<CommunityTheme> = {}): CommunityTheme {
  return {
    id: "item-1",
    themeId: "item-1",
    name: "Koi",
    styles: { fgColor: "#c2410c", bodyPattern: "square" },
    author: { id: "profile-1", name: "Ada Lovelace", image: null },
    likeCount: 3,
    isLikedByMe: false,
    publishedAt: "2026-10-01T00:00:00.000Z",
    tags: ["warm", "bold"],
    slug: "koi",
    handle: "ada",
    official: false,
    ...overrides,
  };
}

const USER_LOGO: ThemeStyles = {
  ...defaultThemeState.styles,
  fgColor: "#123456",
  showLogo: true,
  customLogo: "data:image/png;base64,AAAA",
};

beforeEach(() => {
  toggle.mockReset();
  useQREditorStore.setState({
    themeState: { preset: "classic", styles: USER_LOGO },
    themeCheckpoint: null,
    history: [],
    future: [],
    contentType: "url",
    value: "https://example.org/menu",
    contentConfigs: { url: { type: "url", url: "https://example.org/menu" } },
  });
});

describe("applying a community theme", () => {
  it("replaces the whole look on the defaults, like a built-in preset", () => {
    const next = communityLook(
      { preset: "classic", presetStyles: USER_LOGO, styles: USER_LOGO },
      { fgColor: "#c2410c" },
    );
    expect(next.styles).toEqual({
      ...defaultThemeState.styles,
      fgColor: "#c2410c",
    });
    // The user's own logo goes with the rest of the look (Undo brings it back).
    expect(next.styles.customLogo).toBeUndefined();
    expect(next.styles.showLogo).toBeUndefined();
    // The look no longer comes from the preset.
    expect(next.preset).toBeUndefined();
    expect(next.presetStyles).toBeUndefined();
  });

  it("keeps a logo the theme itself carries (its quick icon)", () => {
    const icon = "data:image/svg+xml,%3Csvg%3E%3C%2Fsvg%3E";
    const next = communityLook(
      { styles: USER_LOGO },
      { showLogo: true, customLogo: icon },
    );
    expect(next.styles.customLogo).toBe(icon);
    expect(next.styles.showLogo).toBe(true);
  });

  it("is one undo step that brings the previous look back, content untouched", () => {
    const before = editor().themeState;
    const { changed } = applyCommunityTheme(theme().styles);

    expect(changed).toBe(true);
    expect(editor().themeState.styles.fgColor).toBe("#c2410c");
    expect(editor().history).toHaveLength(1);
    expect(editor().value).toBe("https://example.org/menu");
    expect(editor().contentConfigs.url).toEqual({
      type: "url",
      url: "https://example.org/menu",
    });

    editor().undo();
    expect(editor().themeState).toEqual(before);
    expect(editor().themeState.styles.customLogo).toBe(USER_LOGO.customLogo);
  });

  it("gives the toast an Undo that restores the look only while it is still applied", () => {
    const before = editor().themeState;
    const first = applyCommunityTheme(theme().styles);
    first.undo();
    expect(editor().themeState).toEqual(before);

    const second = applyCommunityTheme(theme().styles);
    // The user changes something after applying: the toast's Undo leaves it.
    editor().replaceThemeState({
      ...editor().themeState,
      styles: { ...editor().themeState.styles, bgColor: "#fef3c7" },
    });
    const edited = editor().themeState;
    second.undo();
    expect(editor().themeState).toBe(edited);
  });

  it("does nothing (no history entry) when the look is already applied", () => {
    applyCommunityTheme(theme().styles);
    const again = applyCommunityTheme(theme().styles);
    expect(again.changed).toBe(false);
    expect(editor().history).toHaveLength(1);
  });
});

describe("browsing", () => {
  it("searches name, creator, handle and tags, every word, any case", () => {
    const koi = theme();
    expect(matchesSearch(koi, searchTokens(""))).toBe(true);
    expect(matchesSearch(koi, searchTokens("KOI"))).toBe(true);
    expect(matchesSearch(koi, searchTokens("lovelace"))).toBe(true);
    expect(matchesSearch(koi, searchTokens("ada"))).toBe(true);
    expect(matchesSearch(koi, searchTokens("  warm   koi "))).toBe(true);
    expect(matchesSearch(koi, searchTokens("warm neon"))).toBe(false);
    expect(matchesSearch({ ...koi, handle: null }, ["ada"])).toBe(true);
  });

  it("lists each theme once when pages overlap", () => {
    const a = theme({ id: "a" });
    const b = theme({ id: "b" });
    const c = theme({ id: "c" });
    expect(
      uniqueThemes([
        { themes: [a, b], nextCursor: 2 },
        { themes: [b, c], nextCursor: null },
      ]).map((item) => item.id),
    ).toEqual(["a", "b", "c"]);
    expect(uniqueThemes(undefined)).toEqual([]);
  });

  it("only offers likes on community items (legacy gallery rows have no slug)", () => {
    expect(isLikeable(theme())).toBe(true);
    expect(isLikeable(theme({ slug: undefined }))).toBe(false);
    expect(isLikeable(theme({ slug: "" }))).toBe(false);
  });

  it("sets one theme's like state across cached pages", () => {
    const data = {
      pageParams: [undefined],
      pages: [{ themes: [theme(), theme({ id: "x" })], nextCursor: null }],
    };
    const next = withLike(data, "item-1", true, 4);
    expect(next?.pages[0]?.themes[0]).toMatchObject({
      isLikedByMe: true,
      likeCount: 4,
    });
    expect(next?.pages[0]?.themes[1]).toBe(data.pages[0]?.themes[1]);
    expect(withLike(undefined, "item-1", true, 4)).toBeUndefined();
  });
});

describe("likes (v1 reaction, mocked)", () => {
  function deps() {
    const shown: [string, boolean, number][] = [];
    return {
      shown,
      signIn: vi.fn(),
      fail: vi.fn(),
      show: (id: string, liked: boolean, count: number) =>
        shown.push([id, liked, count]),
      toggle: (id: string) => toggleCommunityLike(id),
    };
  }

  it("shows the like at once, then the server's count", async () => {
    toggle.mockResolvedValueOnce({
      ok: true,
      data: { liked: true, likeCount: 9 },
    });
    const d = deps();
    await runLike(theme(), d);
    expect(toggle).toHaveBeenCalledExactlyOnceWith("item-1");
    expect(d.shown).toEqual([
      ["item-1", true, 4],
      ["item-1", true, 9],
    ]);
    expect(d.fail).not.toHaveBeenCalled();
  });

  it("unlikes without going below zero", async () => {
    toggle.mockResolvedValueOnce({
      ok: true,
      data: { liked: false, likeCount: 0 },
    });
    const d = deps();
    await runLike(theme({ isLikedByMe: true, likeCount: 0 }), d);
    expect(d.shown[0]).toEqual(["item-1", false, 0]);
  });

  it("puts the like back and says why when the server refuses", async () => {
    toggle.mockResolvedValueOnce({
      ok: false,
      code: "RATE_LIMITED",
      message: "Too many changes. Try again later.",
    });
    const d = deps();
    await runLike(theme(), d);
    expect(d.shown.at(-1)).toEqual(["item-1", false, 3]);
    expect(d.fail).toHaveBeenCalledWith("Too many changes. Try again later.");
    expect(d.signIn).not.toHaveBeenCalled();
  });

  it("sends a lapsed session through sign-in", async () => {
    toggle.mockResolvedValueOnce({
      ok: false,
      code: "UNAUTHORIZED",
      message: "Sign in to continue.",
    });
    const d = deps();
    await runLike(theme(), d);
    expect(d.signIn).toHaveBeenCalledOnce();
    expect(d.fail).not.toHaveBeenCalled();
    expect(d.shown.at(-1)).toEqual(["item-1", false, 3]);
  });

  it("puts the like back when the request fails outright", async () => {
    toggle.mockRejectedValueOnce(new Error("network"));
    const d = deps();
    await runLike(theme(), d);
    expect(d.shown.at(-1)).toEqual(["item-1", false, 3]);
    expect(d.fail).toHaveBeenCalledOnce();
  });

  it("after signing in, likes once", async () => {
    toggle.mockResolvedValueOnce({
      ok: true,
      data: { liked: true, likeCount: 4 },
    });
    const result = await ensureLiked("item-1", toggleCommunityLike);
    expect(result).toEqual({ ok: true, data: { liked: true, likeCount: 4 } });
    expect(toggle).toHaveBeenCalledOnce();
  });

  it("after signing in, keeps a like the account already had", async () => {
    toggle
      .mockResolvedValueOnce({ ok: true, data: { liked: false, likeCount: 3 } })
      .mockResolvedValueOnce({ ok: true, data: { liked: true, likeCount: 4 } });
    const result = await ensureLiked("item-1", toggleCommunityLike);
    expect(result.ok && result.data.liked).toBe(true);
    expect(toggle).toHaveBeenCalledTimes(2);
  });

  it("after signing in, reports a refusal without retrying", async () => {
    toggle.mockResolvedValueOnce({
      ok: false,
      code: "NOT_FOUND",
      message: "This item isn't in the community.",
    });
    const result = await ensureLiked("item-1", toggleCommunityLike);
    expect(result.ok).toBe(false);
    expect(toggle).toHaveBeenCalledOnce();
  });
});

describe("Publish this style", () => {
  const saved = {
    source: "SAVED" as const,
    label: "Menu look",
    styles: { fgColor: "#111111" },
  };

  it("signs in first when signed out", () => {
    expect(
      publishStep({
        signedIn: false,
        presetId: "theme-1",
        preset: saved,
        unsaved: false,
        saved: undefined,
      }),
    ).toEqual({ kind: "sign-in" });
  });

  it("saves first when the look isn't an unchanged saved theme", () => {
    const base = { signedIn: true, saved: undefined };
    expect(
      publishStep({
        ...base,
        presetId: undefined,
        preset: undefined,
        unsaved: true,
      }).kind,
    ).toBe("save-first");
    expect(
      publishStep({
        ...base,
        presetId: "classic",
        preset: { source: "BUILT_IN", label: "Classic", styles: {} },
        unsaved: false,
      }).kind,
    ).toBe("save-first");
    expect(
      publishStep({
        ...base,
        presetId: "theme-1",
        preset: saved,
        unsaved: true,
      }).kind,
    ).toBe("save-first");
  });

  it("opens the publish dialog for an unchanged saved theme", () => {
    expect(
      publishStep({
        signedIn: true,
        presetId: "theme-1",
        preset: saved,
        unsaved: false,
        saved: {
          name: "Menu look (saved)",
          style: { fgColor: "#222222" },
          isPublished: false,
        },
      }),
    ).toEqual({
      kind: "publish",
      target: {
        themeId: "theme-1",
        name: "Menu look (saved)",
        style: { fgColor: "#222222" },
      },
    });
    // Before the saved list loads, the preset store's copy is used.
    expect(
      publishStep({
        signedIn: true,
        presetId: "theme-1",
        preset: saved,
        unsaved: false,
        saved: undefined,
      }),
    ).toEqual({
      kind: "publish",
      target: { themeId: "theme-1", name: "Menu look", style: saved.styles },
    });
  });

  it("says a theme is already published instead of publishing it twice", () => {
    expect(
      publishStep({
        signedIn: true,
        presetId: "theme-1",
        preset: saved,
        unsaved: false,
        saved: { name: "Menu look", style: {}, isPublished: true },
      }),
    ).toEqual({ kind: "published", name: "Menu look" });
  });
});
