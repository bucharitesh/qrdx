// Compact counts for "QRdx in numbers" (lib/home-numbers). Pure and
// client-safe: the section's count-up animation formats with it too.
//
// Counts are always rounded DOWN, never to the nearest, so the page can't
// overstate anything. From 100,000 up they keep three significant figures
// (4,321,000 is "4.32M+", 999,999 is "999K+", never "1M"); below that, two
// (12,345 is "12K+", 234 is "230+"); under 100 a count is shown as it is.
// "+" means some was rounded away.

/** Counts from here up keep three significant figures; below, two. */
export const THREE_FIGURES_FROM = 100_000;

const UNITS = [
  { size: 1_000_000_000, short: "B", word: "billion" },
  { size: 1_000_000, short: "M", word: "million" },
  { size: 1_000, short: "K", word: "thousand" },
] as const;

export type CompactUnit = "" | (typeof UNITS)[number]["short"];

export interface CompactCount {
  /** The count as shown: rounded down to its significant figures. */
  value: number;
  /** `value` in its unit: 4.32 for 4.32M. */
  amount: number;
  /** Digits after the point in `amount` (0 to 2). */
  decimals: number;
  unit: CompactUnit;
  /** True when the real count is higher than `value`. */
  plus: boolean;
  /** "4.32M+", "999K+", "500K", "230+", "87" */
  text: string;
  /** For screen readers: "more than 4.32 million", "500 thousand", "87" */
  spoken: string;
}

/**
 * Rounded down to three significant figures from 100,000 up, two below.
 * Counts under 100 stay exact.
 */
export function floorToSignificant(count: number): number {
  const figures = count >= THREE_FIGURES_FROM ? 3 : 2;
  const digits = String(count).length;
  if (digits <= figures) return count;
  const step = 10 ** (digits - figures);
  return Math.floor(count / step) * step;
}

/**
 * The compact form of a count of things (a non-negative whole number).
 * Throws on anything else, so a bad query result can never be shown.
 */
export function compactCount(count: number): CompactCount {
  if (!(Number.isSafeInteger(count) && count >= 0)) {
    throw new RangeError(`Not a count: ${count}`);
  }
  const value = floorToSignificant(count);
  const plus = value < count;
  const unit = UNITS.find((candidate) => value >= candidate.size);
  // Three significant figures at most, so this is exact ("4.32", "999", "1").
  const amount = unit ? Number((value / unit.size).toPrecision(3)) : value;
  const decimals = String(amount).split(".")[1]?.length ?? 0;
  const short: CompactUnit = unit?.short ?? "";
  const words = unit ? `${amount} ${unit.word}` : String(amount);
  return {
    value,
    amount,
    decimals,
    unit: short,
    plus,
    text: `${amount}${short}${plus ? "+" : ""}`,
    spoken: plus ? `more than ${words}` : words,
  };
}

/**
 * The text a count-up shows part of the way through (`progress` 0 to 1).
 * Unit, decimals and "+" stay as in the final text, so the width never
 * grows while it counts; at 1 it is exactly `count.text`.
 */
export function countUpText(count: CompactCount, progress: number): string {
  if (progress >= 1) return count.text;
  const scale = 10 ** count.decimals;
  // Whole hundredths (or tenths) first, so 4.32 * 100 is exactly 432.
  const whole = Math.round(count.amount * scale);
  const amount = Math.floor(whole * Math.max(0, progress)) / scale;
  return `${amount.toFixed(count.decimals)}${count.unit}${count.plus ? "+" : ""}`;
}
