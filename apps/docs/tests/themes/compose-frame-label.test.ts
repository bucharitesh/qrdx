// The theme generator's frame labels must read on what the engine actually
// draws them on. Most frame styles set the label on the frame band, but some
// (rounded-border among the generator's choices) set it on the code's own
// background, so a label colored like the background vanished there.
import { getContrastRatio, getFrameLayout } from "qrdx";
import type { FrameStyle } from "qrdx/types";
import { describe, expect, it } from "vitest";
import { FRAME_CHOICES } from "@/lib/themes/blocks";
import {
  composeTheme,
  contrastProblems,
  createRandom,
  FRAME_TEXT_CONTRAST,
  frameLabelBackdrop,
} from "@/lib/themes/compose";
import type { ThemeStyles } from "@/types/theme";

const BAND = "#123456";
const BACKGROUND = "#fedcba";

/**
 * The fill under the middle of the frame label in the engine's own layout:
 * the last rect painted over that point (rings exclude their hole).
 */
function fillUnderLabel(style: FrameStyle, bgColor: string, color: string) {
  const layout = getFrameLayout(
    200,
    { style, text: "Scan me", color, textColor: "#000000" },
    bgColor,
  );
  const label = layout.label;
  if (!label) throw new Error(`${style} draws no label`);
  const x = label.x;
  const y = label.y - label.fontSize * 0.35;
  const inside = (b: { x: number; y: number; width: number; height: number }) =>
    x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height;
  let fill: string | null = null;
  for (const shape of layout.shapes) {
    if (shape.type !== "rect") continue;
    if (inside(shape) && !(shape.hole && inside(shape.hole))) fill = shape.fill;
  }
  return fill;
}

describe("frame label backdrop", () => {
  for (const style of FRAME_CHOICES) {
    it(`${style}: matches where the engine draws the label`, () => {
      const drawnOn = fillUnderLabel(style, BACKGROUND, BAND);
      expect(drawnOn, style).not.toBeNull();
      const styles: ThemeStyles = {
        bgColor: BACKGROUND,
        fgColor: "#000000",
        frame: { style, text: "Scan me", color: BAND },
      };
      expect(frameLabelBackdrop(styles)).toEqual(drawnOn);
    });
  }
});

describe("composed themes", () => {
  // Enough draws to hit every frame choice many times.
  const framed: ThemeStyles[] = [];
  const random = createRandom(20_261_105);
  for (let i = 0; i < 4000; i++) {
    const { styles } = composeTheme(random);
    if (styles.frame?.text) framed.push(styles);
  }

  it("covers every frame choice", () => {
    const styles = new Set(framed.map((s) => s.frame?.style));
    for (const style of FRAME_CHOICES) expect(styles).toContain(style);
  });

  it("colors every label to read on the fill the engine draws under it", () => {
    const unreadable: string[] = [];
    for (const styles of framed) {
      const frame = styles.frame;
      if (!(frame?.color && frame.textColor) || frame.style === "custom") {
        continue;
      }
      const bg = typeof styles.bgColor === "string" ? styles.bgColor : "";
      const drawnOn = fillUnderLabel(frame.style, bg, frame.color);
      if (!drawnOn) continue;
      const ratio = getContrastRatio(frame.textColor, drawnOn);
      if (ratio < FRAME_TEXT_CONTRAST) {
        unreadable.push(
          `${frame.style}: ${frame.textColor} on ${drawnOn} (${ratio.toFixed(2)}:1)`,
        );
      }
    }
    expect(unreadable.slice(0, 5)).toEqual([]);
  });
});

describe("contrastProblems", () => {
  it("flags a label colored like the background it sits on", () => {
    const styles: ThemeStyles = {
      bgColor: "#FFFFFF",
      fgColor: "#111111",
      frame: {
        style: "rounded-border",
        text: "Scan me",
        color: "#111111",
        textColor: "#FFFFFF",
      },
    };
    expect(contrastProblems(styles).join(" ")).toMatch(/frame label 1\.00:1/);
  });

  it("checks a band label against the band, not the background", () => {
    const styles: ThemeStyles = {
      bgColor: "#FFFFFF",
      fgColor: "#111111",
      frame: {
        style: "banner-bottom",
        text: "Scan me",
        color: "#111111",
        textColor: "#FFFFFF",
      },
    };
    expect(contrastProblems(styles)).toEqual([]);
  });

  it("checks the engine's default label color when textColor is unset", () => {
    const onBand: ThemeStyles = {
      bgColor: "#FFFFFF",
      fgColor: "#111111",
      // White by default, on a pale yellow band
      frame: { style: "banner-bottom", text: "Scan me", color: "#FFF6A0" },
    };
    expect(contrastProblems(onBand).join(" ")).toMatch(/frame label/);
  });
});
