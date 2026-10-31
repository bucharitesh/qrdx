// Shuffle themes in the editor's undo state: a shuffle id composes its look
// from building blocks that change between releases, so the store keeps the
// look it resolved to. Undo, Reset and the unsaved-changes check must give
// back that exact look after the blocks change, and sessions persisted before
// that look was stored must still load.
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { defaultThemeState } from "@/config/qr";
import { shuffleId, shuffleTheme } from "@/lib/themes/shuffle";
import { useQREditorStore } from "@/store/editor-store";
import type { ThemeEditorState } from "@/types/editor";
import { getPresetThemeStyles } from "@/utils/qr-presets-helper";

// The editor persists to window.localStorage, which Node doesn't have. The
// store picks its storage up when it is created, on import.
const localStorage = vi.hoisted(() => {
  const items = new Map<string, string>();
  const storage = {
    clear: () => items.clear(),
    getItem: (key: string) => items.get(key) ?? null,
    removeItem: (key: string) => {
      items.delete(key);
    },
    setItem: (key: string, value: string) => {
      items.set(key, String(value));
    },
  };
  vi.stubGlobal("window", { localStorage: storage });
  return storage;
});

afterAll(() => {
  vi.unstubAllGlobals();
});

// The preset store loads saved themes through a server action.
vi.mock("@/actions/qr-themes", () => ({ getThemes: vi.fn() }));

vi.mock("@/lib/themes/shuffle", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/themes/shuffle")>();
  return { ...actual, shuffleTheme: vi.fn(actual.shuffleTheme) };
});

const { shuffleTheme: composeFromBlocks } = await vi.importActual<
  typeof import("@/lib/themes/shuffle")
>("@/lib/themes/shuffle");

/** A release that edits the building blocks: every seed composes anew. */
function changeBuildingBlocks() {
  vi.mocked(shuffleTheme).mockImplementation((seed) => {
    const theme = composeFromBlocks(seed);
    return {
      ...theme,
      styles: {
        ...theme.styles,
        fgColor: "#123456",
        dotColor: "#123456",
        bodyPattern:
          theme.styles.bodyPattern === "square" ? "diamond" : "square",
      },
    };
  });
}

const store = () => useQREditorStore.getState();
const SEED_A = 2_654_435_761;
const SEED_B = 1_013_904_223;

// History entries closer than 0.5 s merge, so each step happens a bit later.
const later = () => vi.setSystemTime(Date.now() + 1000);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.mocked(shuffleTheme).mockImplementation(composeFromBlocks);
  useQREditorStore.setState({
    themeState: defaultThemeState,
    themeCheckpoint: null,
    history: [],
    future: [],
  });
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("shuffle presets in the editor store", () => {
  it("applies the resolved look and keeps the id as a label", () => {
    store().applyThemePreset(shuffleId(SEED_A));
    const { themeState } = store();
    expect(themeState.preset).toBe(shuffleId(SEED_A));
    expect(themeState.styles).toEqual(getPresetThemeStyles(shuffleId(SEED_A)));
    expect(themeState.presetStyles).toEqual(themeState.styles);
    expect(store().hasUnsavedChanges()).toBe(false);

    // Other presets are looked up by id, so they keep no copy.
    later();
    store().applyThemePreset("default");
    expect(store().themeState.presetStyles).toBeUndefined();
  });

  it("restores the exact look on undo and redo after the blocks change", () => {
    store().applyThemePreset(shuffleId(SEED_A));
    const lookA = store().themeState.styles;
    later();
    store().applyThemePreset(shuffleId(SEED_B));
    const lookB = store().themeState.styles;

    changeBuildingBlocks();
    expect(getPresetThemeStyles(shuffleId(SEED_A))).not.toEqual(lookA);

    later();
    store().undo();
    expect(store().themeState.preset).toBe(shuffleId(SEED_A));
    expect(store().themeState.styles).toEqual(lookA);
    expect(store().hasUnsavedChanges()).toBe(false);

    later();
    store().redo();
    expect(store().themeState.styles).toEqual(lookB);
    expect(store().hasUnsavedChanges()).toBe(false);

    later();
    store().undo();
    later();
    store().undo();
    expect(store().themeState).toEqual(defaultThemeState);
  });

  it("resets an edited shuffle to the look it was applied with", () => {
    store().applyThemePreset(shuffleId(SEED_A));
    const lookA = store().themeState.styles;
    later();
    store().setThemeState({
      ...store().themeState,
      styles: { ...lookA, eyeColor: "#ff0000" },
    });
    expect(store().hasUnsavedChanges()).toBe(true);

    changeBuildingBlocks();
    store().resetToCurrentPreset();
    expect(store().themeState.styles).toEqual(lookA);
    expect(store().themeState.preset).toBe(shuffleId(SEED_A));
    expect(store().hasUnsavedChanges()).toBe(false);
    expect(store().hasThemeChangedFromCheckpoint()).toBe(false);
  });

  it("drops the resolved look when a caller switches to another preset", () => {
    store().applyThemePreset(shuffleId(SEED_A));
    later();
    // As the saved-theme loader does: spread the state, set another id.
    store().setThemeState({
      ...store().themeState,
      preset: "some-saved-theme",
    });
    expect(store().themeState.presetStyles).toBeUndefined();
  });
});

describe("persisted editor state", () => {
  const persist = (state: Record<string, unknown>) =>
    localStorage.setItem(
      "editor-storage",
      JSON.stringify({ state, version: 0 }),
    );

  it("loads state saved before shuffles kept their look", async () => {
    const id = shuffleId(SEED_A);
    const base = getPresetThemeStyles(id);
    const edited = { ...base, eyeColor: "#ff0000" };
    const before: ThemeEditorState = { preset: "default", styles: base };
    // The old shape: shuffle ids with styles, no presetStyles anywhere.
    persist({
      themeState: { preset: id, styles: edited },
      themeCheckpoint: { preset: id, styles: base },
      history: [
        { state: before, timestamp: 1 },
        { state: { preset: id, styles: base }, timestamp: 2 },
      ],
      future: [{ state: { preset: id, styles: base }, timestamp: 3 }],
      value: "https://example.com",
      contentType: "url",
      contentConfigs: {},
    });

    await useQREditorStore.persist.rehydrate();
    const { themeState, themeCheckpoint, history, future } = store();
    expect(themeState).toEqual({
      preset: id,
      styles: edited,
      presetStyles: base,
    });
    expect(themeCheckpoint?.presetStyles).toEqual(base);
    expect(history[1]?.state.presetStyles).toEqual(base);
    expect(history[0]?.state).toEqual(before);
    expect(future[0]?.state.presetStyles).toEqual(base);
    expect(store().value).toBe("https://example.com");
    expect(store().hasUnsavedChanges()).toBe(true);

    // From then on the look is fixed, whatever the blocks become.
    changeBuildingBlocks();
    store().resetToCurrentPreset();
    expect(store().themeState.styles).toEqual(base);
  });

  it("keeps the stored look across a reload after the blocks change", async () => {
    store().applyThemePreset(shuffleId(SEED_A));
    const lookA = store().themeState.styles;
    const saved = localStorage.getItem("editor-storage") as string;
    expect(saved).toContain("presetStyles");

    // A new page: fresh in-memory state, then the saved session loads.
    changeBuildingBlocks();
    useQREditorStore.setState({ themeState: defaultThemeState, history: [] });
    localStorage.setItem("editor-storage", saved);
    await useQREditorStore.persist.rehydrate();
    expect(store().themeState.styles).toEqual(lookA);
    expect(store().themeState.presetStyles).toEqual(lookA);
    expect(store().hasUnsavedChanges()).toBe(false);
  });
});
