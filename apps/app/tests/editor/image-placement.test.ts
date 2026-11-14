// use_image's placements (components/editor/ai/image-placement.ts): an
// attached picture as the logo, Logo QR or Image QR art, or a background or
// dots fill, built without AI, then scored and repaired toward Great. The
// browser scores with the editor's scan score; here a scripted scorer
// stands in, so each repair step is checked on its own. The picture never
// reaches the AI context: the editor's chat context strips fills and art.
import { getScanContrast, type ScanScoreResult } from "qrdx";
import { describe, expect, it, vi } from "vitest";

// The editor store persists to window.localStorage, which Node doesn't have.
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
vi.mock("@/actions/qr-themes", () => ({ getThemes: vi.fn() }));
vi.mock("@/actions/user-settings", () => ({ getUserSettings: vi.fn() }));

const { alternativesFor, placeImage, repairPlacement, runPlacementLoop } =
  await import("@/components/editor/ai/image-placement");
const { describeEditorForModel, editorBase, editorContextSchema } =
  await import("@/lib/ai/agent/editor-context");
const { withoutImageFills } = await import("@/lib/paint/image-fills");
const { editorContext } = await import("@/lib/hooks/chat-engine");
const { useQREditorStore } = await import("@/store/editor-store");

const LOGO = "data:image/png;base64,TE9HTw==";
const PICTURE = "data:image/jpeg;base64,UElDVFVSRQ==";
/** A mid-tone photo: its darkest and lightest tenths. */
const TONES = { [PICTURE]: { dark: "#3a3a3a", light: "#c8c8c8" } };
const ART = { width: 1, height: 1, data: "AAAAAA==" };

const BASE = {
  bgColor: "#FFFFFF",
  fgColor: "#111111",
  bodyPattern: "rounded",
  cornerEyePattern: "rounded",
  cornerEyeDotPattern: "rounded",
  level: "M",
  margin: 2,
  showLogo: false,
} as const;

const score = (
  value: number,
  failed: { id: string; message: string; fix?: string }[] = [],
): ScanScoreResult => ({
  score: value,
  grade: value >= 85 ? "great" : value >= 70 ? "ok" : "risky",
  checks: [
    { id: "contrast", passed: true, message: "Contrast is fine" },
    ...failed.map((check) => ({ ...check, passed: false })),
  ],
});

describe("placing a picture", () => {
  it("as the logo: shown, with error correction H", () => {
    const { style, changes } = placeImage({ ...BASE }, "logo", { logo: LOGO });
    expect(style).toMatchObject({
      showLogo: true,
      customLogo: LOGO,
      level: "H",
    });
    expect(changes).toEqual([
      "Raised error correction to H so the logo doesn't hide data",
    ]);
    // Already at H: nothing else changes.
    expect(
      placeImage({ ...BASE, level: "H" }, "logo", { logo: LOGO }).changes,
    ).toEqual([]);
  });

  it("as Image QR and Logo QR art, with the settings art needs", () => {
    const photo = placeImage({ ...BASE }, "image_qr", {
      art: { halftone: ART },
    });
    expect(photo.style.art).toMatchObject({
      mode: "halftone",
      image: ART,
      intensity: 0.6,
    });
    expect(photo.style).toMatchObject({ level: "H", margin: 4 });
    expect(photo.changes).toContain(
      "Raised error correction to H so the art scans",
    );

    const logo = placeImage({ ...BASE }, "logo_qr", { art: { logo: ART } });
    expect(logo.style.art).toMatchObject({ mode: "logo", image: ART });
  });

  it("makes art render: light-on-dark colors swap and picture fills go", () => {
    const { style, changes } = placeImage(
      {
        ...BASE,
        bgColor: "#111111",
        fgColor: {
          type: "image",
          src: PICTURE,
          fit: "cover",
          scale: 1,
          position: "center",
          opacity: 1,
          underlay: "#FFFFFF",
        },
      },
      "image_qr",
      { art: { halftone: ART } },
    );
    expect(JSON.stringify(style)).not.toContain(PICTURE);
    expect(style.bgColor).not.toBe("#111111");
    expect(changes).toContain(
      "Swapped the picture fills for solid colors for the art",
    );
  });

  it("as the background: faded over white until the code reads on it", () => {
    const { style, changes } = placeImage(
      { ...BASE, art: { mode: "halftone", image: ART } },
      "background",
      { picture: PICTURE, tones: TONES },
    );
    expect(style.art).toBeUndefined();
    expect(style.bgColor).toMatchObject({
      type: "image",
      src: PICTURE,
      underlay: "#ffffff",
    });
    const opacity = (style.bgColor as { opacity: number }).opacity;
    expect(opacity).toBeLessThan(1);
    // The scan score's own contrast check passes now.
    const contrast = getScanContrast(
      { value: "https://qrdx.dev", ...style },
      { imageTones: TONES },
    );
    expect(contrast.ratio).toBeGreaterThanOrEqual(contrast.required);
    expect(changes).toContain("Turned off the Logo QR / Image QR art");
    expect(
      changes.some((change) => change.startsWith("Faded the picture")),
    ).toBe(true);
  });

  it("in the dots: over black, with the eyes kept solid", () => {
    const { style } = placeImage({ ...BASE, bgColor: "#FFFFFF" }, "dots", {
      picture: PICTURE,
      tones: TONES,
    });
    expect(style.fgColor).toMatchObject({
      type: "image",
      src: PICTURE,
      underlay: "#000000",
    });
    expect(style.eyeColor).toBe("#111111");
    expect(style.dotColor).toBe("#111111");
    const contrast = getScanContrast(
      { value: "https://qrdx.dev", ...style },
      { imageTones: TONES },
    );
    expect(contrast.ratio).toBeGreaterThanOrEqual(contrast.required);
  });
});

describe("repairing toward Great", () => {
  it("tones art down when the code doesn't read", () => {
    const placed = placeImage({ ...BASE }, "image_qr", {
      art: { halftone: ART },
    });
    const { style, changes } = repairPlacement(placed.style, "image_qr", [
      { id: "decode-96", message: "Doesn't read at 96 px" },
    ]);
    expect(style.art?.intensity).toBe(0.45);
    expect(changes).toEqual(["Toned the art down to 45% so the code reads"]);
  });

  it("fades a background picture further and widens the quiet zone", () => {
    const placed = placeImage({ ...BASE }, "background", {
      picture: PICTURE,
      tones: TONES,
    });
    const before = (placed.style.bgColor as { opacity: number }).opacity;
    const { style, changes } = repairPlacement(placed.style, "background", [
      { id: "decode-128", message: "Doesn't read at 128 px" },
      { id: "quiet-zone", message: "Margin too small" },
    ]);
    expect((style.bgColor as { opacity: number }).opacity).toBeLessThan(before);
    expect(style.margin).toBe(4);
    expect(changes).toHaveLength(2);
  });

  it("shrinks a logo that still hides too much at H", () => {
    const { style, changes } = repairPlacement(
      { ...BASE, level: "H", showLogo: true, customLogo: LOGO },
      "logo",
      [{ id: "logo", message: "The logo covers too much" }],
    );
    expect(style.logoOptions?.size).toBe(0.2);
    expect(changes).toEqual(["Made the logo smaller (20% of the code)"]);
  });

  it("runs until Great and lists what it changed", async () => {
    const scorer = vi
      .fn()
      .mockResolvedValueOnce(
        score(72, [{ id: "decode-96", message: "Doesn't read at 96 px" }]),
      )
      .mockResolvedValueOnce(score(90));
    const attempts: number[] = [];
    const result = await runPlacementLoop({
      value: "https://example.com",
      style: { ...BASE },
      placement: "image_qr",
      assets: { art: { halftone: ART } },
      score: scorer,
      onAttempt: (attempt) => attempts.push(attempt.score),
    });
    expect(result).toMatchObject({ score: 90, grade: "great", repairs: 1 });
    expect(result.failed).toEqual([]);
    expect(result.changes).toContain(
      "Toned the art down to 45% so the code reads",
    );
    expect(attempts).toEqual([72, 90]);
    // Scored with the editor's content, and the art in the style.
    expect(scorer.mock.calls[1]?.[0]).toBe("https://example.com");
    expect(scorer.mock.calls[1]?.[1].art.intensity).toBe(0.45);
  });

  it("says plainly what still fails when it can't reach Great", async () => {
    const failing = score(64, [
      {
        id: "decode-96",
        message: "Phones may not read it at small sizes",
        fix: "Print it bigger.",
      },
    ]);
    const scorer = vi.fn().mockResolvedValue(failing);
    const result = await runPlacementLoop({
      value: "https://example.com",
      style: { ...BASE },
      placement: "image_qr",
      assets: { art: { halftone: ART } },
      score: scorer,
    });
    expect(result.grade).not.toBe("great");
    expect(result.failed).toEqual([
      {
        id: "decode-96",
        message: "Phones may not read it at small sizes",
        fix: "Print it bigger.",
      },
    ]);
    // At most three repairs, then other ways to offer.
    expect(scorer).toHaveBeenCalledTimes(4);
    expect(alternativesFor("image_qr")).toEqual(["logo", "background"]);
  });
});

describe("the picture stays out of the AI context", () => {
  it("drops fills and art from what the chat sends and what the model reads", () => {
    const placed = placeImage({ ...BASE }, "background", {
      picture: PICTURE,
      tones: TONES,
    });
    const withArt = placeImage(placed.style, "image_qr", {
      art: { halftone: ART },
    });
    for (const style of [
      placed.style,
      { ...placed.style, art: withArt.style.art },
    ]) {
      useQREditorStore.setState({
        contentType: "url",
        contentConfigs: { url: { type: "url", url: "https://example.com" } },
        value: "https://example.com",
        themeState: {
          ...useQREditorStore.getState().themeState,
          styles: style,
        },
      });
      const sent = editorContext();
      expect(JSON.stringify(sent)).not.toContain(PICTURE);
      expect(JSON.stringify(sent)).not.toContain(ART.data);
      expect(sent.hasArt).toBe(Boolean(style.art));
      const told = describeEditorForModel(
        editorBase(editorContextSchema.parse(sent)),
      );
      expect(told).not.toContain("data:image");
      expect(told).not.toContain("example.com");
    }
    // Links, community items and snippets go through the same helper.
    expect(JSON.stringify(withoutImageFills(placed.style))).not.toContain(
      PICTURE,
    );
  });
});
