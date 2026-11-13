// The paint picker's math: color models, CSS parsing, gradient stop
// editing, the QR contrast readout and its fix, and swatch storage.
import { MAX_GRADIENT_STOPS } from "@repo/config";
import { getScanContrast } from "qrdx";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  channelsOf,
  hsbaToHex,
  hsbToRgb,
  hslToRgb,
  parseColorString,
  rgbToHsb,
  rgbToHsl,
  toHex,
  toHsba,
  withChannel,
} from "@/lib/paint/color-math";
import {
  levelOf,
  makeScannable,
  paintSafety,
  roleOf,
  safetyMessage,
} from "@/lib/paint/contrast";
import {
  addStop,
  colorAtOffset,
  moveStop,
  normalizeStops,
  removeStop,
  reverseStops,
  rotateAngle,
  sortedIndex,
} from "@/lib/paint/gradient-stops";
import {
  addRecent,
  DEFAULT_SWATCHES,
  designColors,
  pushFront,
  RECENT_KEY,
  RECENT_MAX,
  readRecent,
  readSaved,
  toggleSaved,
} from "@/lib/paint/swatches";

const rgb = (r: number, g: number, b: number, a = 1) => ({ r, g, b, a });
const rounded = (color: { r: number; g: number; b: number; a: number }) => ({
  r: Math.round(color.r),
  g: Math.round(color.g),
  b: Math.round(color.b),
  a: Math.round(color.a * 1000) / 1000,
});

describe("color models", () => {
  it.each([
    [rgb(255, 0, 0), { h: 0, s: 100, b: 100 }],
    [rgb(0, 255, 0), { h: 120, s: 100, b: 100 }],
    [rgb(0, 0, 255), { h: 240, s: 100, b: 100 }],
    [rgb(255, 255, 255), { h: 0, s: 0, b: 100 }],
    [rgb(0, 0, 0), { h: 0, s: 0, b: 0 }],
    [rgb(29, 78, 216), { h: 224.3, s: 86.6, b: 84.7 }],
  ])("RGB %o ↔ HSB %o", (color, hsb) => {
    const out = rgbToHsb(color);
    expect(out.h).toBeCloseTo(hsb.h, 1);
    expect(out.s).toBeCloseTo(hsb.s, 1);
    expect(out.b).toBeCloseTo(hsb.b, 1);
    expect(rounded(hsbToRgb(out))).toEqual(color);
  });

  it.each([
    [rgb(255, 0, 0), { h: 0, s: 100, l: 50 }],
    [rgb(128, 128, 128), { h: 0, s: 0, l: 50.2 }],
    [rgb(29, 78, 216), { h: 224.3, s: 76.3, l: 48.0 }],
    [rgb(254, 243, 199), { h: 48, s: 96.5, l: 88.8 }],
  ])("RGB %o ↔ HSL %o", (color, hsl) => {
    const out = rgbToHsl(color);
    expect(out.h).toBeCloseTo(hsl.h, 0);
    expect(out.s).toBeCloseTo(hsl.s, 1);
    expect(out.l).toBeCloseTo(hsl.l, 1);
    expect(rounded(hslToRgb(out))).toEqual(color);
  });

  it("round-trips every 8-bit gray and a sweep of hues through both", () => {
    for (let v = 0; v <= 255; v += 15) {
      expect(rounded(hsbToRgb(rgbToHsb(rgb(v, v, v))))).toEqual(rgb(v, v, v));
      expect(rounded(hslToRgb(rgbToHsl(rgb(v, v, v))))).toEqual(rgb(v, v, v));
    }
    for (let h = 0; h < 360; h += 7) {
      const color = rounded(hsbToRgb({ h, s: 70, b: 60, a: 1 }));
      expect(rounded(hslToRgb(rgbToHsl(color)))).toEqual(color);
    }
  });

  it("writes hex with alpha only when see-through", () => {
    expect(toHex(rgb(29, 78, 216))).toBe("#1d4ed8");
    expect(toHex(rgb(29, 78, 216, 0.5))).toBe("#1d4ed880");
    expect(toHex(rgb(29, 78, 216, 0.5), { alpha: false })).toBe("#1d4ed8");
    expect(hsbaToHex({ h: 0, s: 100, b: 100, a: 0.8 })).toBe("#ff0000cc");
  });

  it("edits one channel of any model and keeps a gray's hue", () => {
    const blue = toHsba(rgb(29, 78, 216));
    expect(channelsOf(blue, "rgb")).toEqual({ r: 29, g: 78, b: 216 });
    expect(channelsOf(withChannel(blue, "rgb", "r", 200), "rgb").r).toBe(200);
    expect(channelsOf(withChannel(blue, "hsl", "l", 90), "hsl").l).toBe(90);
    expect(withChannel(blue, "hsb", "b", 150).b).toBe(100);
    // Saturation to 0 and back: the hue the user had survives
    const gray = withChannel({ h: 200, s: 50, b: 50, a: 1 }, "hsb", "s", 0);
    expect(withChannel(gray, "hsb", "s", 60).h).toBe(200);
    // A gray from RGB fields keeps the picker's hue too
    const fromRgb = withChannel(
      { h: 200, s: 0, b: 50, a: 1 },
      "rgb",
      "g",
      127.5,
    );
    expect(fromRgb.h).toBe(200);
    expect(toHsba(rgb(128, 128, 128), 200).h).toBe(200);
  });
});

describe("parsing pasted CSS colors", () => {
  it.each([
    ["#1d4ed8", rgb(29, 78, 216)],
    ["1d4ed8", rgb(29, 78, 216)],
    ["#abc", rgb(170, 187, 204)],
    ["#1d4ed880", rgb(29, 78, 216, 128 / 255)],
    ["#abcd", rgb(170, 187, 204, 221 / 255)],
    ["rgb(29, 78, 216)", rgb(29, 78, 216)],
    ["rgba(29,78,216,0.5)", rgb(29, 78, 216, 0.5)],
    ["rgb(29 78 216 / 50%)", rgb(29, 78, 216, 0.5)],
    ["rgb(100% 0% 0%)", rgb(255, 0, 0)],
    ["hsl(0 100% 50%)", rgb(255, 0, 0)],
    ["hsla(120, 100%, 25%, 0.4)", rgb(0, 128, 0, 0.4)],
    ["hsl(0.5turn 100% 50%)", rgb(0, 255, 255)],
    ["hsb(240, 100%, 100%)", rgb(0, 0, 255)],
    ["  Teal ", rgb(0, 128, 128)],
    ["transparent", rgb(0, 0, 0, 0)],
  ])("%s", (input, expected) => {
    const parsed = parseColorString(input);
    expect(parsed).not.toBeNull();
    expect(rounded(parsed as never)).toEqual(rounded(expected));
  });

  it.each([
    "",
    "#12",
    "#12345",
    "rgb(1, 2)",
    "hsl(x, 1, 2)",
    "rgb(1 2 3 / 4 / 5)",
    "banana",
  ])("refuses %j", (input) => {
    expect(parseColorString(input)).toBeNull();
  });
});

describe("gradient stops", () => {
  const stops = [
    { color: "#000000", offset: 0 },
    { color: "#ffffff", offset: 100 },
  ];

  it("adds a stop colored as the gradient is there", () => {
    const added = addStop(stops, 50);
    expect(added?.index).toBe(2);
    expect(added?.stops[2]).toEqual({ color: "#808080", offset: 50 });
    // Premultiplied: fading to transparent keeps the hue
    const fade = [
      { color: "#ff0000", offset: 0 },
      { color: "#ff000000", offset: 100 },
    ];
    expect(toHex(colorAtOffset(fade, 50))).toBe("#ff000080");
  });

  it("caps the number of stops", () => {
    let current = stops;
    for (let i = 0; i < MAX_GRADIENT_STOPS + 4; i++) {
      current = addStop(current, i * 5)?.stops ?? current;
    }
    expect(current).toHaveLength(MAX_GRADIENT_STOPS);
    expect(addStop(current, 10)).toBeNull();
  });

  it("removes a stop but keeps two, and selects the nearest neighbour", () => {
    expect(removeStop(stops, 0)).toBeNull();
    const three = [...stops, { color: "#ff0000", offset: 40 }];
    const removed = removeStop(three, 2);
    expect(removed?.stops).toEqual(stops);
    expect(removed?.index).toBe(0);
  });

  it("moves, reverses, sorts and rotates", () => {
    const moved = moveStop(stops, 0, 130);
    expect(moved[0]?.offset).toBe(100);
    expect(moveStop(stops, 1, 33.333)[1]?.offset).toBe(33.3);
    expect(
      reverseStops([
        { color: "#000000", offset: 10 },
        { color: "#ffffff", offset: 70 },
      ]),
    ).toEqual([
      { color: "#ffffff", offset: 30 },
      { color: "#000000", offset: 90 },
    ]);
    const crossed = [
      { color: "#000000", offset: 80 },
      { color: "#ffffff", offset: 20 },
    ];
    expect(normalizeStops(crossed).map((stop) => stop.offset)).toEqual([
      20, 80,
    ]);
    expect(sortedIndex(crossed, 0)).toBe(1);
    expect(rotateAngle(300, 90)).toBe(30);
    expect(rotateAngle(0, -90)).toBe(270);
  });
});

describe("QR contrast", () => {
  it("names roles from the control ids", () => {
    expect(roleOf("bgColor")).toBe("background");
    expect(roleOf("fgColor")).toBe("code");
    expect(roleOf("eyeColors.topLeft.inner")).toBe("code");
    expect(roleOf("frame-color")).toBeNull();
  });

  it("uses the scan score's thresholds", () => {
    expect(levelOf(4.5)).toBe("good");
    expect(levelOf(4.49)).toBe("low");
    expect(levelOf(3)).toBe("low");
    expect(levelOf(2.99)).toBe("poor");
    expect(levelOf(1.49)).toBe("fails");
  });

  it("matches getScanContrast for the color in place", () => {
    const style = { bgColor: "#fef3c7", fgColor: "#1d4ed8" };
    const safety = paintSafety("code", "#93c5fd", style);
    const engine = getScanContrast({
      value: "x",
      bgColor: "#fef3c7",
      fgColor: "#93c5fd",
    });
    expect(safety.ratio).toBeCloseTo(engine.ratio, 1);
    expect(safety.level).toBe("poor");
    expect(safetyMessage(safety)).toBe("Hard to scan");
    expect(safetyMessage(paintSafety("code", "#000000", style))).toBeNull();
  });

  it("judges a see-through code color as it looks", () => {
    const style = { bgColor: "#ffffff" };
    expect(paintSafety("code", "#000000", style).level).toBe("good");
    // Black at 20% looks like #ccc: 1.6:1
    expect(paintSafety("code", "#00000033", style).level).toBe("poor");
    expect(paintSafety("code", "#0000001a", style).level).toBe("fails");
  });

  it("judges a background against every code color", () => {
    const style = { fgColor: "#000000", eyeColor: "#93c5fd" };
    expect(paintSafety("background", "#ffffff", style).level).toBe("poor");
  });

  it("flags light code on a dark background", () => {
    const safety = paintSafety("code", "#ffffff", { bgColor: "#000000" });
    expect(safety.inverted).toBe(true);
    expect(safetyMessage(safety)).toBe("Light on dark");
  });

  it("fixes a code color with the smallest darkening that passes", () => {
    const style = { bgColor: "#ffffff" };
    const fixed = makeScannable("code", "#93c5fd", style) as string;
    expect(typeof fixed).toBe("string");
    const after = paintSafety("code", fixed, style);
    expect(after.level).toBe("good");
    expect(after.ratio).toBeLessThan(5);
    // Hue kept: still blue
    const { h } = rgbToHsl(parseColorString(fixed) as never);
    expect(h).toBeGreaterThan(200);
    expect(h).toBeLessThan(225);
  });

  it("makes a see-through color opaque before darkening it", () => {
    expect(makeScannable("code", "#1d4ed833", { bgColor: "#ffffff" })).toBe(
      "#1d4ed8",
    );
  });

  it("fixes each stop of a gradient and lightens a background", () => {
    const style = { bgColor: "#ffffff" };
    const fixed = makeScannable(
      "code",
      {
        type: "angular",
        angle: 0,
        stops: [
          { color: "#fca5a5", offset: 0 },
          { color: "#1d4ed8", offset: 100 },
        ],
      },
      style,
    );
    expect(fixed && typeof fixed === "object" && fixed.type).toBe("angular");
    expect(paintSafety("code", fixed as never, style).level).toBe("good");
    const background = makeScannable("background", "#94a3b8", {
      fgColor: "#1e293b",
    }) as string;
    expect(
      paintSafety("background", background, { fgColor: "#1e293b" }).level,
    ).toBe("good");
  });

  it("can't fix a code color on a background that is too dark", () => {
    expect(makeScannable("code", "#888888", { bgColor: "#0a0a0a" })).toBeNull();
  });

  it("offers defaults that pass for their role", () => {
    for (const color of DEFAULT_SWATCHES.code) {
      expect(paintSafety("code", color, { bgColor: "#ffffff" }).level).toBe(
        "good",
      );
    }
    for (const color of DEFAULT_SWATCHES.background) {
      expect(
        paintSafety("background", color, { fgColor: "#000000" }).level,
      ).toBe("good");
    }
  });
});

describe("swatches", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    Object.assign(globalThis, {
      window: Object.assign(new EventTarget(), {
        localStorage: {
          getItem: (key: string) => store.get(key) ?? null,
          setItem: (key: string, value: string) => store.set(key, value),
        },
      }),
    });
  });
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  it("collects the design's colors once each", () => {
    expect(
      designColors({
        bgColor: "#FFFFFF",
        fgColor: {
          type: "linear",
          angle: 0,
          stops: [
            { color: "#000000", offset: 0 },
            { color: "#1d4ed8", offset: 100 },
          ],
        },
        eyeColor: "#000",
        eyeColors: { topLeft: { outer: "#7c3aed" } },
        logoOptions: { plate: "#ffffff" },
      }),
    ).toEqual(["#ffffff", "#000000", "#1d4ed8", "#7c3aed"]);
  });

  it("keeps recent colors newest first, capped", () => {
    for (let i = 0; i < RECENT_MAX + 3; i++) {
      addRecent([`#0000${i.toString(16).padStart(2, "0")}`]);
    }
    const recent = readRecent();
    expect(recent).toHaveLength(RECENT_MAX);
    expect(recent[0]).toBe("#00000c");
    expect(pushFront(["#000000", "#ffffff"], "#FFF", 5)).toEqual([
      "#ffffff",
      "#000000",
    ]);
  });

  it("saves and unsaves a color", () => {
    expect(toggleSaved("#1D4ED8")).toEqual(["#1d4ed8"]);
    expect(readSaved()).toEqual(["#1d4ed8"]);
    expect(toggleSaved("#1d4ed8")).toEqual([]);
  });

  it("survives storage that throws or holds junk", () => {
    store.set(RECENT_KEY, "{not json");
    expect(readRecent()).toEqual([]);
    Object.assign(globalThis, {
      window: Object.assign(new EventTarget(), {
        localStorage: {
          getItem: () => {
            throw new Error("blocked");
          },
          setItem: () => {
            throw new Error("blocked");
          },
        },
      }),
    });
    expect(readSaved()).toEqual([]);
    expect(() => toggleSaved("#000000")).not.toThrow();
  });
});
