// Compact counts for "QRdx in numbers" (lib/home-numbers). Pure and
// client-safe: the section's count-up animation formats with it too.
//
// Counts are always rounded DOWN, never to the nearest, so the page can't
// overstate anything: 4,321,000 is "4.3M+", 999,999 is "990K+", never "1M".
// Under 100 a count is shown as it is. "+" means some was rounded away.

const UNITS = [
  { size: 1_000_000_000, short: "B", word: "billion" },
  { size: 1_000_000, short: "M", word: "million" },
  { size: 1_000, short: "K", word: "thousand" },
] as const;

export type CompactUnit = "" | (typeof UNITS)[number]["short"];

export interface CompactCount {
  /** The count as shown: rounded down to two significant digits. */
  value: number;
  /** `value` in its unit: 4.3 for 4.3M. */
  amount: number;
  /** Digits after the point in `amount` (0 or 1). */
  decimals: number;
  unit: CompactUnit;
  /** True when the real count is higher than `value`. */
  plus: boolean;
  /** "4.3M+", "500K", "230+", "87" */
  text: string;
  /** For screen readers: "more than 4.3 million", "500 thousand", "87" */
  spoken: string;
}

/** Two significant digits, rounded down. Counts under 100 stay exact. */
export function floorToTwoDigits(count: number): number {
  const digits = String(count).length;
  if (digits <= 2) return count;
  const step = 10 ** (digits - 2);
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
  const value = floorToTwoDigits(count);
  const plus = value < count;
  const unit = UNITS.find((candidate) => value >= candidate.size);
  // Two significant digits at most, so this is exact ("4.3", "430", "1").
  const amount = unit ? Number((value / unit.size).toPrecision(2)) : value;
  const decimals = Number.isInteger(amount) ? 0 : 1;
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
  const amount =
    Math.floor(count.amount * scale * Math.max(0, progress)) / scale;
  return `${amount.toFixed(count.decimals)}${count.unit}${count.plus ? "+" : ""}`;
}
