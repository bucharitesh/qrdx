import type {
  BuiltInFrameStyle,
  CodeFrame,
  OfficialFrameId,
  PageCode,
} from "./model";
import type { SampleValue } from "./values";

// Shorthand for the code lists in type-codes.ts and topic-codes.ts.

export interface TileSpec {
  label: string;
  sample: SampleValue;
  preset: string;
  frame?: CodeFrame | null;
}

const labels = (text?: string, secondaryText?: string) => ({
  ...(text === undefined ? {} : { text }),
  ...(secondaryText === undefined ? {} : { secondaryText }),
});

/**
 * An official frame (qrdx OFFICIAL_FRAMES) with its own labels, or with
 * these. A new main label hides the frame's own second line (often written
 * for its default label) unless a second line is given too.
 */
export const official = (
  id: OfficialFrameId,
  text?: string,
  secondaryText?: string,
): CodeFrame => ({
  official: id,
  ...labels(
    text,
    text !== undefined && secondaryText === undefined ? "" : secondaryText,
  ),
});

/** A built-in frame style with a call to action. */
export const framed = (
  style: BuiltInFrameStyle,
  text?: string,
  secondaryText?: string,
): CodeFrame => ({ style, ...labels(text, secondaryText) });

export const tile = (
  label: string,
  sample: SampleValue,
  preset: string,
  frame?: CodeFrame | null,
): TileSpec => ({ label, sample, preset, frame });

/** Page codes from tile specs, with ids `<key>-1`, `<key>-2`... */
export function codesFor(key: string, tiles: TileSpec[]): PageCode[] {
  return tiles.map(({ label, sample, preset, frame }, index) => {
    const code: PageCode = {
      id: `${key}-${index + 1}`,
      label,
      value: sample.value,
      type: sample.type,
      preset,
    };
    if (frame !== undefined) code.frame = frame;
    return code;
  });
}
