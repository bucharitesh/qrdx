// Logo QR and Image QR only render dark dots on a light background with room
// in between (qrdx's getQRArtColorIssue, the renderer's own rule). With other
// colors the code silently stays plain, so the Art section explains why and
// offers a one-click fix built here.

import { getQRArtColorIssue, type QRArtColorIssue } from "qrdx";
import { type ColorConfig, getSolidColor } from "qrdx/types";
import type { QRStyle } from "@/types/theme";

type ArtColors = Pick<QRStyle, "bgColor" | "fgColor" | "eyeColor" | "dotColor">;

/** A color as the renderer reads it: gradients by their first stop. */
const solid = (color: ColorConfig | undefined, fallback: string) =>
  getSolidColor(color, fallback);

/** Why art isn't showing with these colors, or null when it can. */
export function artColorIssue(style: ArtColors): QRArtColorIssue | null {
  return getQRArtColorIssue(
    solid(style.fgColor, "#000000"),
    solid(style.bgColor, "#ffffff"),
  );
}

export const ART_COLOR_ISSUE_COPY: Record<QRArtColorIssue, string> = {
  inverted:
    "Art is off: it needs dark dots on a light background, and your dots are lighter than the background.",
  "low-contrast":
    "Art is off: it needs dark dots on a light background, and your dot and background colors are too close.",
};

/**
 * The smallest color change that lets art render: swap inverted colors, or
 * put the dots on white. Eye and dot colors that would vanish on the new
 * background follow the dots. Null when nothing needs changing.
 */
export function artColorFix(style: ArtColors): Partial<ArtColors> | null {
  const issue = artColorIssue(style);
  if (!issue) return null;

  let bgColor: ColorConfig;
  let fgColor: ColorConfig;
  if (issue === "inverted") {
    bgColor = style.fgColor ?? "#ffffff";
    fgColor = style.bgColor ?? "#000000";
  } else {
    bgColor = "#ffffff";
    fgColor =
      style.fgColor !== undefined &&
      getQRArtColorIssue(solid(style.fgColor, "#000000"), "#ffffff") === null
        ? style.fgColor
        : "#000000";
  }

  const newBg = solid(bgColor, "#ffffff");
  // Eyes and center dots need the same room from the background as the dots.
  // Unset ones already follow the dots.
  const follow = (color: ColorConfig | undefined) =>
    color === undefined ||
    getQRArtColorIssue(solid(color, "#000000"), newBg) === null
      ? color
      : fgColor;

  return {
    bgColor,
    fgColor,
    eyeColor: follow(style.eyeColor),
    dotColor: follow(style.dotColor),
  };
}
