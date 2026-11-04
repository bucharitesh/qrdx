// Applying a playground link to the editor: the plan's order, a look change
// the editor's Undo takes back, an outcome `undo` that also restores the
// content, a toast only when something the user had was replaced, and
// nothing applied twice.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// The editor persists to window.localStorage, which Node doesn't have.
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

// The preset store loads saved themes through a server action.
vi.mock("@/actions/qr-themes", () => ({ getThemes: vi.fn() }));

const { useCodeDialogStore } = await import(
  "@/components/editor/action-bar/code-dialog-store"
);
const { usePhotoScanDialogStore } = await import(
  "@/components/editor/photo-scan-dialog-store"
);
const { useCommunitySheetStore } = await import(
  "@/components/editor/community-sheet-store"
);
const { useDownloadDialogStore } = await import(
  "@/components/editor/action-bar/download-dialog-store"
);
const { defaultThemeState } = await import("@/config/qr");
const { applyPlaygroundParams } = await import("@/lib/playground-apply");
const { parsePlaygroundParams, stripOneShotParams, hasOneShotParams } =
  await import("@/lib/playground-links");
const { encodeStyleParam } = await import("@/lib/playground-style");
const { useQREditorStore } = await import("@/store/editor-store");
const { usePlaygroundFocusStore } = await import(
  "@/store/playground-focus-store"
);
const { getPresetThemeStyles } = await import("@/utils/qr-presets-helper");

import type { LinkedDynamicCode } from "@/components/editor/dynamic-link-toggle";
import type { ApplyContext } from "@/lib/playground-apply";

afterAll(() => {
  vi.unstubAllGlobals();
});

const editor = () => useQREditorStore.getState();

let linked: LinkedDynamicCode | null = null;
const context = (overrides: Partial<ApplyContext> = {}): ApplyContext => ({
  themePath: false,
  signedIn: false,
  aiAvailable: true,
  isBuiltInPreset: (id) =>
    ["classic", "halloweenPumpkin", "sunset"].includes(id),
  presetLabel: (id) => (id === "classic" ? "Classic" : id),
  dynamicLink: {
    get: () => linked,
    unlink: () => {
      linked = null;
    },
    link: (code) => {
      linked = code;
    },
  },
  ...overrides,
});

const apply = (href: string, overrides?: Partial<ApplyContext>) => {
  const url = new URL(href, "https://qrdx.dev");
  return applyPlaygroundParams(
    parsePlaygroundParams(url.search, url.hash),
    context(overrides),
  );
};

const MY_STYLE = {
  ...defaultThemeState.styles,
  fgColor: "#123456",
  bodyPattern: "diamond" as const,
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-03T10:00:00Z"));
  linked = null;
  useQREditorStore.setState({
    themeState: defaultThemeState,
    themeCheckpoint: null,
    history: [],
    future: [],
    contentType: "url",
    value: "",
    contentConfigs: {},
  });
  useDownloadDialogStore.setState({ open: false, request: null });
  useCodeDialogStore.setState({ open: false, lang: null });
  usePhotoScanDialogStore.setState({ open: false });
  useCommunitySheetStore.setState({ open: false, publishRequested: false });
  usePlaygroundFocusStore.setState({ section: null });
});

describe("the look", () => {
  it("applies a preset as one undo step", () => {
    useQREditorStore.setState({ themeState: { styles: MY_STYLE } });
    const outcome = apply("/playground?preset=classic");
    expect(editor().themeState.preset).toBe("classic");
    expect(editor().themeState.styles).toEqual(getPresetThemeStyles("classic"));
    expect(outcome.applied).toEqual(["preset"]);
    editor().undo();
    expect(editor().themeState.styles).toEqual(MY_STYLE);
  });

  it("ignores unknown presets", () => {
    const outcome = apply("/playground?preset=notAPreset");
    expect(outcome.applied).toEqual([]);
    expect(editor().themeState).toEqual(defaultThemeState);
  });

  it("applies a shared style over the defaults, with its preset as the label", () => {
    useQREditorStore.setState({ themeState: { styles: MY_STYLE } });
    const shared = encodeStyleParam(
      { ...getPresetThemeStyles("classic"), fgColor: "#ff0000" },
      { preset: "classic" },
    );
    const outcome = apply(`/playground?style=${shared?.value}`);
    expect(outcome.applied).toEqual(["style"]);
    expect(editor().themeState.preset).toBe("classic");
    expect(editor().themeState.styles).toEqual({
      ...defaultThemeState.styles,
      ...getPresetThemeStyles("classic"),
      fgColor: "#ff0000",
    });
    // The editor's own Undo brings the previous design back.
    editor().undo();
    expect(editor().themeState.styles).toEqual(MY_STYLE);
  });

  it("records the undo step even right after another edit", () => {
    useQREditorStore.setState({ themeState: { styles: MY_STYLE } });
    editor().setThemeState({ styles: { ...MY_STYLE, level: "H" } });
    const shared = encodeStyleParam({ bgColor: "#eeeeee" });
    apply(`/playground?style=${shared?.value}`);
    editor().undo();
    expect(editor().themeState.styles).toEqual({ ...MY_STYLE, level: "H" });
  });

  it("prefers a valid style over a preset, and a preset over a broken style", () => {
    const shared = encodeStyleParam({ bgColor: "#eeeeee" });
    expect(
      apply(`/playground?preset=classic&style=${shared?.value}`).applied,
    ).toEqual(["style"]);
    expect(apply("/playground?preset=classic&style=1.broken").applied).toEqual([
      "preset",
    ]);
  });

  it("leaves the look to a /playground/<id> theme", () => {
    const shared = encodeStyleParam({ bgColor: "#eeeeee" });
    const outcome = apply(`/playground?preset=classic&style=${shared?.value}`, {
      themePath: true,
    });
    expect(outcome.applied).toEqual([]);
    expect(editor().themeState).toEqual(defaultThemeState);
  });
});

describe("content", () => {
  it("selects a type and encodes what this browser stored for it", () => {
    useQREditorStore.setState({
      contentConfigs: {
        wifi: { type: "wifi", ssid: "Cafe", password: "pw", encryption: "WPA" },
      },
    });
    apply("/playground?type=wifi");
    expect(editor().contentType).toBe("wifi");
    expect(editor().value).toContain("S:Cafe");
  });

  it("opens Dub and Drive types as a URL code when signed out", () => {
    apply("/playground?type=dubsh");
    expect(editor().contentType).toBe("url");
    apply("/playground?type=google-drive", { signedIn: true });
    expect(editor().contentType).toBe("google-drive");
  });

  it("sets a web address as static URL content", () => {
    apply("/playground#url=https%3A%2F%2Fexample.com%2Fmenu");
    expect(editor().contentType).toBe("url");
    expect(editor().value).toBe("https://example.com/menu");
    expect(editor().contentConfigs.url).toEqual({
      type: "url",
      url: "https://example.com/menu",
    });
  });

  it("goes static when a dynamic code points elsewhere, and Undo relinks it", () => {
    const code: LinkedDynamicCode = {
      id: "c1",
      shortLink: "https://qrdx.dev/q/abc",
      destinationUrl: "https://old.example/",
      userId: "u1",
    };
    linked = code;
    useQREditorStore.setState({
      contentConfigs: { url: { type: "url", url: "https://old.example/" } },
      value: code.shortLink,
    });
    const outcome = apply("/playground?url=https://new.example/");
    expect(linked).toBeNull();
    expect(editor().value).toBe("https://new.example/");
    outcome.undo();
    expect(linked).toEqual(code);
    expect(editor().value).toBe(code.shortLink);
  });

  it("keeps a dynamic code that already points at the address", () => {
    linked = {
      id: "c1",
      shortLink: "https://qrdx.dev/q/abc",
      destinationUrl: "https://example.com/",
      userId: "u1",
    };
    apply("/playground?url=https://example.com/");
    expect(linked).not.toBeNull();
    expect(editor().value).toBe("https://qrdx.dev/q/abc");
  });

  it("never turns dynamic on by itself", () => {
    apply("/playground?url=https://example.com/");
    expect(linked).toBeNull();
  });
});

describe("view", () => {
  it("rewrites the Generate tab to Design where AI is off", () => {
    expect(apply("/playground?tab=generate").tab).toBe("ai");
    expect(apply("/playground?tab=generate", { aiAvailable: false }).tab).toBe(
      "customisations",
    );
    expect(apply("/playground?tab=ai", { aiAvailable: false }).tab).toBe(
      "customisations",
    );
  });

  it("opens Design at a section", () => {
    const outcome = apply("/playground?section=logo");
    expect(outcome.tab).toBe("customisations");
    expect(usePlaygroundFocusStore.getState().section).toBe("logo");
  });

  it("opens the print tab at a width once there is content", () => {
    useQREditorStore.setState({ value: "https://example.com" });
    const outcome = apply("/playground?open=print&print=40mm");
    expect(outcome.needsContent).toBe(false);
    expect(useDownloadDialogStore.getState()).toMatchObject({
      open: true,
      request: { tab: "print", print: { size: 40, unit: "mm" } },
    });
  });

  it("keeps the print request for later when there's nothing to download", () => {
    const outcome = apply("/playground?open=print&print=2in");
    expect(outcome.needsContent).toBe(true);
    expect(useDownloadDialogStore.getState()).toMatchObject({
      open: false,
      request: { tab: "print", print: { size: 2, unit: "in" } },
    });
  });

  it("opens Get code on the tab a link names, and forgets it on close", () => {
    const outcome = apply("/playground?open=code&lang=mcp");
    expect(useCodeDialogStore.getState()).toMatchObject({
      open: true,
      lang: "mcp",
    });
    expect(outcome.applied).toEqual(["open", "lang"]);
    useCodeDialogStore.getState().setOpen(false);
    expect(useCodeDialogStore.getState().lang).toBeNull();
    apply("/playground?open=code");
    expect(useCodeDialogStore.getState()).toMatchObject({
      open: true,
      lang: null,
    });
  });

  it("opens the photo check and the community sheet", () => {
    apply("/playground?open=photo-check");
    expect(usePhotoScanDialogStore.getState().open).toBe(true);
    apply("/playground?open=community");
    expect(useCommunitySheetStore.getState().open).toBe(true);
    expect(useCommunitySheetStore.getState().publishRequested).toBe(false);
  });
});

describe("the toast and its Undo", () => {
  it("stays quiet when nothing of the user's was replaced", () => {
    const outcome = apply("/playground?preset=classic&type=wifi");
    expect(outcome.replaced).toBe(false);
  });

  it("speaks up when a design of the user's was replaced, and Undo restores it", () => {
    useQREditorStore.setState({ themeState: { styles: MY_STYLE } });
    const outcome = apply("/playground?preset=classic");
    expect(outcome.replaced).toBe(true);
    expect(outcome.message).toBe("Opened the Classic theme");
    outcome.undo();
    expect(editor().themeState.styles).toEqual(MY_STYLE);
  });

  it("speaks up when content was replaced, and Undo restores it", () => {
    useQREditorStore.setState({
      contentType: "url",
      contentConfigs: { url: { type: "url", url: "https://mine.example/" } },
      value: "https://mine.example/",
    });
    const outcome = apply("/playground?type=wifi");
    expect(outcome.replaced).toBe(true);
    expect(outcome.message).toBe("Opened with the WiFi type");
    outcome.undo();
    expect(editor().contentType).toBe("url");
    expect(editor().value).toBe("https://mine.example/");
  });

  it("names both parts", () => {
    useQREditorStore.setState({ themeState: { styles: MY_STYLE } });
    expect(
      apply("/playground?preset=classic&url=https://www.example.com/").message,
    ).toBe("Opened the Classic theme with example.com");
  });

  it("leaves a look the user changed since alone", () => {
    useQREditorStore.setState({ themeState: { styles: MY_STYLE } });
    const outcome = apply("/playground?preset=classic");
    vi.setSystemTime(Date.now() + 1000);
    editor().setThemeState({
      ...editor().themeState,
      styles: { ...editor().themeState.styles, level: "L" },
    });
    outcome.undo();
    expect(editor().themeState.styles.level).toBe("L");
  });
});

describe("once only", () => {
  it("applies nothing from the address it leaves behind", () => {
    useQREditorStore.setState({ themeState: { styles: MY_STYLE } });
    const href =
      "https://qrdx.dev/playground?preset=classic&type=wifi&open=code&utm_source=x";
    apply(href);
    const historyLength = editor().history.length;
    const left = stripOneShotParams(href, null);
    expect(left).toBe("/playground?utm_source=x");
    const url = new URL(left, "https://qrdx.dev");
    const again = parsePlaygroundParams(url.search, url.hash);
    expect(hasOneShotParams(again)).toBe(false);
    expect(applyPlaygroundParams(again, context()).applied).toEqual([]);
    expect(editor().history.length).toBe(historyLength);
  });
});
