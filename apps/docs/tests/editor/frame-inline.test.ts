// Frame text edited in the playground preview (components/editor/frame-inline):
// each label the engine marks maps to the frame option it edits, edits stay
// within the label's limit and are cleaned when kept, and one edit (however
// many keystrokes and menu changes) is one undo step; Escape puts it back.
import {
  type AnyQRFrame,
  FRAME_FONT_SCALE_MAX,
  FRAME_FONT_SCALE_MIN,
  FRAME_TEXT_MAX_LENGTH,
  type FrameSpec,
  getFrameSpecIssues,
  OFFICIAL_FRAMES,
  type QRCustomFrame,
} from "qrdx";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  charactersLeft,
  clampFrameText,
  frameTextTarget,
  frameTweaks,
  nearTextLimit,
  withFrameText,
  withFrameTweak,
} from "@/components/editor/frame-inline/frame-text-fields";
import { placeMenu } from "@/components/editor/frame-inline/menu-placement";
import { defaultThemeState } from "@/config/qr";
import { useQREditorStore } from "@/store/editor-store";
import type { ThemeEditorState } from "@/types/editor";

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
afterAll(() => {
  vi.unstubAllGlobals();
});
vi.mock("@/actions/qr-themes", () => ({ getThemes: vi.fn() }));

const signRider = OFFICIAL_FRAMES.find((frame) => frame.id === "sign-rider");
if (!signRider) throw new Error("The sign rider frame is missing");
const SIGN_RIDER: QRCustomFrame = { style: "custom", spec: signRider.spec };

/** A community-style spec with a fixed label and a short limit. */
const WITH_FIXED: QRCustomFrame = {
  style: "custom",
  spec: {
    ...signRider.spec,
    labels: [
      ...signRider.spec.labels,
      {
        type: "text",
        id: "agent",
        slot: "fixed",
        text: "Harbour Homes",
        maxLength: 16,
        color: "text",
        box: { x: 96, y: 700, width: 832, height: 96 },
        align: "start",
      },
    ],
  } as FrameSpec,
};

describe("which field a preview label edits", () => {
  it("built-in frames: text and secondaryText", () => {
    const frame: AnyQRFrame = { style: "banner-top-bottom", text: "Hi" };
    expect(frameTextTarget(frame, "text")).toMatchObject({
      field: "text",
      maxLength: FRAME_TEXT_MAX_LENGTH,
      name: "Label",
      value: "Hi",
    });
    expect(frameTextTarget(frame, "secondaryText")).toMatchObject({
      field: "secondaryText",
      name: "Second line",
      value: "",
    });
  });

  it("a built-in frame with no text set shows the default label", () => {
    expect(frameTextTarget({ style: "banner-bottom" }, "text")?.value).toBe(
      "Scan me",
    );
  });

  it("custom frames: each label by its id, through its slot", () => {
    expect(frameTextTarget(SIGN_RIDER, "cta")).toMatchObject({
      field: "text",
      labelId: "cta",
      value: "Scan for photos & price",
    });
    expect(frameTextTarget(SIGN_RIDER, "note")).toMatchObject({
      field: "secondaryText",
      labelId: "note",
      value: "Book a viewing",
    });
    const edited = { ...SIGN_RIDER, text: "Open Sunday 2-4" };
    expect(frameTextTarget(edited, "cta")?.value).toBe("Open Sunday 2-4");
  });

  it("a fixed label edits its own text in the spec, with its own limit", () => {
    expect(frameTextTarget(WITH_FIXED, "agent")).toMatchObject({
      field: "label",
      labelId: "agent",
      maxLength: 16,
      value: "Harbour Homes",
    });
  });

  it("nothing for unknown markers or no frame", () => {
    expect(frameTextTarget(SIGN_RIDER, "text")).toBeNull();
    expect(frameTextTarget({ style: "border" }, "cta")).toBeNull();
    expect(frameTextTarget({ style: "none" }, "text")).toBeNull();
    expect(frameTextTarget(undefined, "text")).toBeNull();
  });
});

describe("text limits and cleaning", () => {
  const target = frameTextTarget(SIGN_RIDER, "cta");
  if (!target) throw new Error("no target");

  it("stops at the limit", () => {
    const long = "Scan for photos, price and the floor plan";
    const frame = withFrameText(SIGN_RIDER, target, long);
    expect(frame.text).toBe(long.slice(0, FRAME_TEXT_MAX_LENGTH));
    expect(frame.text).toHaveLength(FRAME_TEXT_MAX_LENGTH);
  });

  it("never splits a character at the limit", () => {
    const text = `${"a".repeat(FRAME_TEXT_MAX_LENGTH - 1)}🏠`;
    expect(clampFrameText(text, FRAME_TEXT_MAX_LENGTH)).toBe(
      "a".repeat(FRAME_TEXT_MAX_LENGTH - 1),
    );
  });

  it("turns line breaks into spaces", () => {
    expect(clampFrameText("Book\na viewing", 24)).toBe("Book a viewing");
  });

  it("a draft keeps what's typed; keeping it cleans it", () => {
    const typed = "Book  a​ viewing ";
    expect(withFrameText(SIGN_RIDER, target, typed).text).toBe(typed);
    expect(
      withFrameText(SIGN_RIDER, target, typed, { commit: true }).text,
    ).toBe("Book a viewing");
  });

  it("a fixed label's text is clean in every draft, so the spec still draws", () => {
    const fixed = frameTextTarget(WITH_FIXED, "agent");
    if (!fixed) throw new Error("no target");
    // Past its 16-character limit, and a double space typed mid-word
    const frame = withFrameText(WITH_FIXED, fixed, "Rao &  Sons Estates");
    if (frame.style !== "custom") throw new Error("not custom");
    const label = frame.spec.labels.find((item) => item.id === "agent");
    expect(label?.text).toBe("Rao & Sons Esta");
    expect(getFrameSpecIssues(frame.spec)).toEqual([]);
    // The spec it came from is untouched
    expect(
      WITH_FIXED.spec.labels.find((item) => item.id === "agent")?.text,
    ).toBe("Harbour Homes");
  });

  it("counts what's left, and says so near the limit", () => {
    expect(charactersLeft("Scan me", 24)).toBe(17);
    expect(nearTextLimit("Scan me", 24)).toBe(false);
    expect(nearTextLimit("a".repeat(16), 24)).toBe(true);
    expect(charactersLeft("a".repeat(24), 24)).toBe(0);
    expect(nearTextLimit("a".repeat(10), 16)).toBe(true);
  });
});

describe("the menu", () => {
  it("shows the colors and icons a custom frame uses", () => {
    expect(frameTweaks(SIGN_RIDER)).toEqual({
      fontScale: 1,
      textColor: signRider.spec.colors.text,
      frameColor: signRider.spec.colors.frame,
      icons: ["home"],
    });
  });

  it("a built-in frame's text color is what's drawn until one is picked", () => {
    expect(frameTweaks({ style: "border" }, "#000000").textColor).toBe(
      "#000000",
    );
    expect(
      frameTweaks({ style: "border", textColor: "#ff0000" }, "#000000")
        .textColor,
    ).toBe("#ff0000");
    expect(frameTweaks({ style: "border" }).frameColor).toBe("#000000");
    expect(frameTweaks({ style: "border" }).icons).toEqual([]);
  });

  it("keeps the text size within the engine's range", () => {
    expect(
      withFrameTweak(SIGN_RIDER, { kind: "fontScale", value: 9 }).fontScale,
    ).toBe(FRAME_FONT_SCALE_MAX);
    expect(
      withFrameTweak(SIGN_RIDER, { kind: "fontScale", value: 0 }).fontScale,
    ).toBe(FRAME_FONT_SCALE_MIN);
  });

  it("swaps the icon in the spec", () => {
    const frame = withFrameTweak(SIGN_RIDER, {
      kind: "icon",
      from: "home",
      to: "pin",
    });
    expect(frameTweaks(frame).icons).toEqual(["pin"]);
    expect(frameTweaks(SIGN_RIDER).icons).toEqual(["home"]);
  });

  it("sets the frame and text colors", () => {
    const frame = withFrameTweak(
      withFrameTweak(SIGN_RIDER, { kind: "frameColor", value: "#1d4ed8" }),
      { kind: "textColor", value: "#fafafa" },
    );
    expect(frame).toMatchObject({ color: "#1d4ed8", textColor: "#fafafa" });
  });
});

describe("one edit is one undo step", () => {
  const store = () => useQREditorStore.getState();
  const withFrame = (frame: AnyQRFrame): ThemeEditorState => ({
    ...store().themeState,
    styles: { ...store().themeState.styles, frame },
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    useQREditorStore.setState({
      themeState: { ...defaultThemeState, styles: { frame: SIGN_RIDER } },
      themeCheckpoint: null,
      history: [],
      future: [],
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Types `text` into the sign rider's call to action, a key at a time. */
  function typeInto(text: string) {
    const target = frameTextTarget(SIGN_RIDER, "cta");
    if (!target) throw new Error("no target");
    for (let end = 1; end <= text.length; end++) {
      vi.setSystemTime(Date.now() + 700);
      const frame = store().themeState.styles.frame as AnyQRFrame;
      store().draftThemeState(
        withFrame(withFrameText(frame, target, text.slice(0, end))),
      );
    }
  }

  it("typing shows live and adds no history until it's kept", () => {
    const before = store().themeState;
    typeInto("Open house");
    expect(store().themeState.styles.frame?.text).toBe("Open house");
    expect(store().history).toHaveLength(0);

    // A menu change in the same edit
    const frame = store().themeState.styles.frame as AnyQRFrame;
    store().draftThemeState(
      withFrame(withFrameTweak(frame, { kind: "fontScale", value: 1.2 })),
    );

    store().commitThemeDraft(before);
    expect(store().history).toHaveLength(1);

    store().undo();
    expect(store().themeState).toEqual(before);
    store().redo();
    expect(store().themeState.styles.frame).toMatchObject({
      text: "Open house",
      fontScale: 1.2,
    });
  });

  it("Escape puts the frame back and leaves no undo step", () => {
    const before = store().themeState;
    typeInto("Sold");
    store().draftThemeState(before);
    expect(store().themeState).toEqual(before);
    expect(store().history).toHaveLength(0);
    expect(store().canUndo()).toBe(false);
  });

  it("keeping an unchanged edit adds no step", () => {
    const before = store().themeState;
    store().commitThemeDraft(before);
    expect(store().history).toHaveLength(0);
  });

  it("a quick edit right after doesn't merge into the kept one", () => {
    const before = store().themeState;
    typeInto("Open house");
    store().commitThemeDraft(before);
    // Within the 0.5 s window setThemeState merges quick edits in
    const frame = store().themeState.styles.frame as AnyQRFrame;
    store().setThemeState(withFrame({ ...frame, color: "#1d4ed8" }));
    expect(store().history).toHaveLength(2);
    store().undo();
    expect(store().themeState.styles.frame?.text).toBe("Open house");
    store().undo();
    expect(store().themeState).toEqual(before);
  });
});

describe("where the menu floats", () => {
  // A 1000 × 800 preview with the frame drawn in the middle
  const bounds = { width: 1000, height: 800 };
  const artwork = { left: 200, top: 220, width: 600, height: 300 };
  const menu = { width: 300, height: 36 };

  it("outside the frame, on the edge nearer the text", () => {
    const top = { left: 260, top: 300, width: 240, height: 30 };
    expect(placeMenu(menu, top, artwork, bounds)).toEqual({
      left: 230,
      top: 220 - 10 - 36,
      above: true,
    });
    const bottom = { left: 260, top: 460, width: 240, height: 30 };
    expect(placeMenu(menu, bottom, artwork, bounds)).toMatchObject({
      top: 520 + 10,
      above: false,
    });
  });

  it("right by the text when the frame fills the preview", () => {
    const full = { left: 200, top: 20, width: 600, height: 740 };
    const label = { left: 300, top: 680, width: 400, height: 50 };
    expect(placeMenu(menu, label, full, bounds)).toEqual({
      left: 350,
      top: 680 - 10 - 36,
      above: true,
    });
  });

  it("stays inside the preview", () => {
    const edge = { left: 0, top: 300, width: 40, height: 30 };
    expect(placeMenu(menu, edge, artwork, bounds).left).toBe(8);
    const right = { left: 960, top: 300, width: 40, height: 30 };
    expect(placeMenu(menu, right, artwork, bounds).left).toBe(1000 - 300 - 8);
  });
});
