/** biome-ignore-all lint/style/noMagicNumbers: the artwork's own geometry */
// The Dot Ring's text layout as it was up to qrdx 0.0.54, kept unchanged:
// text that fits the ring with a word space to spare must still be set
// exactly like this (tests/dot-ring-template.test.ts). Also the rough letter
// widths, to measure a line the way the layout does.
import { CENTER } from "../../src/template/dot-ring-layout";
import { roundTo } from "../../src/utils/fmt";
import { sanitizeFrameText } from "../../types/frame-spec-rules";

const DEFAULT_FONT_SIZE = 32;
const TEXT_PATH_RADIUS = 246.5;
export const CIRCUMFERENCE = 2 * Math.PI * TEXT_PATH_RADIUS;
const HALF_CAP = 0.36;
const TEXT_BAND_RADIUS = TEXT_PATH_RADIUS + HALF_CAP * DEFAULT_FONT_SIZE;
const TEXT_MAX_LENGTH = 400;

/** A rough letter width for a heavy sans-serif. */
export function letterWidth(char: string, fontSize: number): number {
  if (char === " " || /[il1|!']/.test(char)) {
    return fontSize * 0.3;
  }
  if (/[mwMW@%&]/.test(char)) {
    return fontSize * 0.8;
  }
  return fontSize * 0.6;
}

/** The text as drawn: no control or invisible characters, spaces kept. */
export function cleanText(text: string): string[] {
  const clean = text
    .slice(0, TEXT_MAX_LENGTH)
    .split(" ")
    .map((word) => sanitizeFrameText(word, TEXT_MAX_LENGTH))
    .join(" ");
  return Array.from(clean).slice(0, TEXT_MAX_LENGTH);
}

interface RingLetter {
  char: string;
  x: number;
  y: number;
  rotate: number;
}

/** Letters of `text` along the ring, centered at the top or the bottom. */
export function legacyDotRingLetters(
  text: string,
  options: {
    fontSize: number;
    letterSpacing: number;
    position: "top" | "bottom";
    rotation: number;
  }
): RingLetter[] {
  const { fontSize, letterSpacing, position, rotation } = options;
  const circumference = 2 * Math.PI * TEXT_PATH_RADIUS;
  // Keep the letters that fit around the ring
  const kept: { char: string; along: number }[] = [];
  let offset = 0;
  for (const char of cleanText(text)) {
    const width = letterWidth(char, fontSize);
    if (offset + width > circumference) {
      break;
    }
    kept.push({ char, along: offset + width / 2 });
    offset += width + letterSpacing;
  }
  const total = offset - (kept.length > 0 ? letterSpacing : 0);
  const top = position !== "bottom";
  // Baseline: the letters' band centered on TEXT_BAND_RADIUS, rising
  // outwards at the top and inwards at the bottom
  const radius = top
    ? TEXT_BAND_RADIUS - HALF_CAP * fontSize
    : TEXT_BAND_RADIUS + HALF_CAP * fontSize;
  const half = (total / circumference) * 180;
  const letters: RingLetter[] = [];
  for (const { char, along } of kept) {
    if (char.trim() === "") {
      continue;
    }
    const step = (along / circumference) * 360;
    // Degrees clockwise from twelve o'clock
    const angle = top ? rotation - half + step : rotation + 180 + half - step;
    const radians = (angle * Math.PI) / 180;
    letters.push({
      char,
      x: roundTo(CENTER + radius * Math.sin(radians)),
      y: roundTo(CENTER - radius * Math.cos(radians)),
      rotate: roundTo(top ? angle : angle - 180),
    });
  }
  return letters;
}
