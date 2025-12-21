/**
 * Format a number into a compact string representation
 * @example 1000 -> "1k"
 * @example 1500 -> "1.5k"
 * @example 1000000 -> "1M"
 */
export function formatCompactNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  }
  return num.toString();
}
