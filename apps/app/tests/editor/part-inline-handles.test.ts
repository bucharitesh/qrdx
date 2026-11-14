// The preview's direct handles and keys (components/editor/part-inline,
// round 2): the logo's drag, resize and nudge maths, the padding handle,
// per-eye colors, the symbol and a shaped code's ring, and which keys the
// parts take.
import { LOGO_SIZE_MAX, LOGO_SIZE_MIN } from "qrdx/types";
import { describe, expect, it } from "vitest";
import {
  eyeInnerColor,
  eyeOuterColor,
  hasEyeColors,
  withEyeColor,
  withoutEyeColor,
} from "@/components/editor/control-sections/eye-colors";
import type { Box } from "@/components/editor/frame-inline/preview-labels";
import {
  LOGO_CENTER_SNAP,
  logoCenter,
  logoCenterRange,
  marginFromDrag,
  movedLogo,
  nudgedLogo,
  resizedLogo,
  steppedLogoSize,
  steppedMargin,
} from "@/components/editor/part-inline/drag-math";
import { partKeyAction } from "@/components/editor/part-inline/part-keys";
import {
  intersectBox,
  type MeasuredParts,
  partAt,
  partTargets,
  symbolBox,
} from "@/components/editor/part-inline/part-targets";
import type { QRStyle } from "@/types/theme";

const box = (left: number, top: number, width: number, height = width) => ({
  left,
  top,
  width,
  height,
});

// A 400px symbol at (100, 100) in a 440px code; a 100px logo in the middle
const symbol: Box = box(100, 100, 400);
const code: Box = box(80, 80, 440);
const logo: Box = box(250, 250, 100);

describe("moving the logo", () => {
  it("measures its center as shares across the symbol", () => {
    expect(logoCenter(logo, symbol)).toEqual({ x: 0.5, y: 0.5 });
  });

  it("follows the pointer as a share of the symbol", () => {
    expect(movedLogo({ dx: 80, dy: -40 }, { logo, symbol })).toEqual({
      x: 0.7,
      y: 0.4,
    });
  });

  it("stops where the engine keeps the logo inside the symbol", () => {
    const [min, max] = logoCenterRange(100, 400);
    expect([min, max]).toEqual([0.125, 0.875]);
    expect(movedLogo({ dx: 900, dy: -900 }, { logo, symbol })).toEqual({
      x: max,
      y: min,
    });
  });

  it("snaps back to the middle near it", () => {
    const near = LOGO_CENTER_SNAP * 400 * 0.9;
    expect(movedLogo({ dx: near, dy: -near }, { logo, symbol })).toEqual({
      x: 0.5,
      y: 0.5,
    });
  });

  it("arrow keys nudge it, Shift further, other keys don't", () => {
    expect(nudgedLogo("ArrowRight", false, { logo, symbol })).toEqual({
      x: 0.51,
      y: 0.5,
    });
    expect(nudgedLogo("ArrowUp", true, { logo, symbol })).toEqual({
      x: 0.5,
      y: 0.45,
    });
    expect(nudgedLogo("Enter", false, { logo, symbol })).toBeNull();
  });
});

describe("resizing the logo", () => {
  it("grows from its center: the corner's move counts twice", () => {
    // 100px of a 440px code, the corner 11px out each way: 122px
    expect(resizedLogo({ dx: 11, dy: 11 }, { logo, code })).toBeCloseTo(
      122 / 440,
      2,
    );
  });

  it("stays between the smallest logo and what the code can repair", () => {
    expect(resizedLogo({ dx: -500, dy: -500 }, { logo, code })).toBe(
      LOGO_SIZE_MIN,
    );
    expect(resizedLogo({ dx: 500, dy: 500 }, { logo, code })).toBe(
      LOGO_SIZE_MAX,
    );
    expect(resizedLogo({ dx: 500, dy: 500 }, { logo, code }, 0.2)).toBe(0.2);
  });

  it("arrow keys on the corner step it", () => {
    expect(steppedLogoSize("ArrowUp", false, 0.2)).toBe(0.21);
    expect(steppedLogoSize("ArrowLeft", true, 0.2)).toBe(0.15);
    expect(steppedLogoSize("ArrowUp", true, 0.28)).toBe(LOGO_SIZE_MAX);
    expect(steppedLogoSize("ArrowUp", false, 0.2, 0.2)).toBe(0.2);
    expect(steppedLogoSize("a", false, 0.2)).toBeNull();
  });
});

describe("the padding handle", () => {
  it("adds a module for each module's width dragged inward", () => {
    expect(marginFromDrag(0, 30, 10, 10)).toBe(3);
    expect(marginFromDrag(4, -24, 10, 10)).toBe(2);
    expect(marginFromDrag(2, 4, 10, 10)).toBe(2);
  });

  it("stays within the padding control's range", () => {
    expect(marginFromDrag(2, -500, 10, 10)).toBe(0);
    expect(marginFromDrag(2, 500, 10, 10)).toBe(10);
    expect(marginFromDrag(3, 50, 0, 10)).toBe(3);
  });

  it("arrow keys step it", () => {
    expect(steppedMargin("ArrowUp", 2, 10)).toBe(3);
    expect(steppedMargin("ArrowLeft", 0, 10)).toBe(0);
    expect(steppedMargin("End", 2, 10)).toBe(10);
    expect(steppedMargin("Home", 2, 10)).toBe(0);
    expect(steppedMargin("x", 2, 10)).toBeNull();
  });
});

describe("one eye at a time", () => {
  const style: QRStyle = {
    fgColor: "#111111",
    eyeColor: "#222222",
    dotColor: "#333333",
  };

  it("writes the clicked eye's frame or center only", () => {
    const eyeColors = withEyeColor(undefined, "topRight", "outer", "#b91c1c");
    expect(eyeColors).toEqual({ topRight: { outer: "#b91c1c" } });
    const both = withEyeColor(eyeColors, "topRight", "inner", "#1d4ed8");
    expect(both).toEqual({
      topRight: { outer: "#b91c1c", inner: "#1d4ed8" },
    });
    const next = { ...style, eyeColors: both };
    expect(eyeOuterColor(next, "topRight")).toBe("#b91c1c");
    expect(eyeInnerColor(next, "topRight")).toBe("#1d4ed8");
    // The others keep the Eyes and Dots colors
    expect(eyeOuterColor(next, "topLeft")).toBe("#222222");
    expect(eyeInnerColor(next, "bottomLeft")).toBe("#333333");
  });

  it("Same as the others clears that eye, and the field when none is left", () => {
    const two = withEyeColor(
      withEyeColor(undefined, "topLeft", "outer", "#000000"),
      "bottomLeft",
      "inner",
      "#ff0000",
    );
    expect(withoutEyeColor(two, "topLeft")).toEqual({
      bottomLeft: { inner: "#ff0000" },
    });
    expect(withoutEyeColor(withoutEyeColor(two, "topLeft"), "bottomLeft")).toBe(
      undefined,
    );
    expect(hasEyeColors({ eyeColors: two })).toBe(true);
    expect(hasEyeColors({})).toBe(false);
  });
});

describe("the symbol and a shaped code's ring", () => {
  const eyes = [box(150, 150, 70), box(430, 150, 70), box(150, 430, 70)];
  const measured: MeasuredParts = {
    eyes,
    symbol: symbolBox(eyes),
    dots: intersectBox(box(100, 100, 450), box(150, 150, 350)),
    logo: null,
    background: box(100, 100, 450),
    artwork: box(100, 100, 450),
  };

  it("the symbol spans the three eyes", () => {
    expect(symbolBox(eyes)).toEqual(box(150, 150, 350));
    expect(symbolBox(eyes.slice(0, 2))).toBeNull();
    expect(intersectBox(box(0, 0, 10), box(20, 20, 5))).toBeNull();
  });

  it("the ring around a circle or heart opens the background's toolbar", () => {
    const targets = partTargets(measured, { frame: false, shaped: true });
    const ring = targets.find((target) => target.kind === "ring");
    expect(ring?.part).toBe("background");
    // In the ring: above the background's own button, under the dots
    expect(partAt(targets, 120, 300)).toBe("background");
    expect(partAt(targets, 300, 300)).toBe("dots");
    expect(
      partTargets(measured, { frame: false }).some(
        (target) => target.kind === "ring",
      ),
    ).toBe(false);
  });
});

describe("keys over the parts", () => {
  const base = {
    modifier: false,
    typing: false,
    open: null,
    pointed: null,
    logoFocused: false,
  };

  it("R gives the open part, else the pointed one, a random look", () => {
    expect(partKeyAction({ ...base, key: "r", open: "eyes" })).toEqual({
      type: "random",
      part: "eyes",
    });
    expect(partKeyAction({ ...base, key: "R", pointed: "dots" })).toEqual({
      type: "random",
      part: "dots",
    });
    // Nothing pointed: the page's own R (Reset) keeps it
    expect(partKeyAction({ ...base, key: "r" })).toBeNull();
  });

  it("never while typing or with Cmd, Ctrl or Alt", () => {
    expect(
      partKeyAction({ ...base, key: "r", open: "eyes", typing: true }),
    ).toBeNull();
    expect(
      partKeyAction({ ...base, key: "r", pointed: "eyes", modifier: true }),
    ).toBeNull();
  });

  it("Delete or Backspace hides the focused logo, only the logo", () => {
    for (const key of ["Delete", "Backspace"]) {
      expect(partKeyAction({ ...base, key, logoFocused: true })).toEqual({
        type: "hide-logo",
      });
      expect(partKeyAction({ ...base, key, pointed: "dots" })).toBeNull();
    }
  });
});
