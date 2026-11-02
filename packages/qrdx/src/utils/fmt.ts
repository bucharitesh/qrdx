// Number formatting for every vector output (SVG markup, EPS, PDF).
//
// Output coordinates are pixels at the rendered size (modules for the plain
// getQRAsSVG renderer, points for EPS). The smallest code is 50 px across,
// so a module is at least about 1 px and rounding to 0.001 moves an edge by
// at most 0.0005 px (0.01 px when that 50 px code is blown up to 1024 px).
// Rasterized with librsvg, that changes 0.2–3% of pixels by 1–2 levels on
// average, less than shifting the unrounded drawing by 0.0005 px does.
// Unrounded, JavaScript writes up to 17 significant digits
// (12.345678901234567), which roughly doubled the markup.
//
// Half-circle arcs need care: when rounding makes the chord a hair shorter
// than the diameter, the arc's center leaves the chord (by √(2rδ), 0.2 px
// for r = 40), so round the radius first and derive the chord from it.

/** Decimals kept for coordinates, radii and lengths. */
export const COORD_DECIMALS = 3;

/**
 * Decimals kept for scale factors: their error grows with the distance from
 * the origin (a 1000-unit artwork scaled by a 6-decimal factor still lands
 * within 0.001).
 */
export const SCALE_DECIMALS = 6;

/** `value` rounded to `decimals` places (half up), never -0. */
export function roundTo(value: number, decimals = COORD_DECIMALS): number {
  const scale = 10 ** decimals;
  // `+ 0` turns -0 into 0
  return Math.round(value * scale) / scale + 0;
}

/**
 * `value` for SVG, EPS or PDF output: rounded to `decimals` places, with no
 * trailing zeros and no "-0". `fmt(12.345678901234567)` is "12.346",
 * `fmt(4.5)` is "4.5" and `fmt(-0.0001)` is "0". No exponent for
 * |value| < 1e21 with up to 6 decimals.
 */
export function fmt(value: number, decimals = COORD_DECIMALS): string {
  return String(roundTo(value, decimals));
}

/**
 * Template tag that writes every interpolated number with `fmt` (strings
 * pass through), for path data and transforms:
 * compact`M${x} ${y}h${w}` is "M1.5 2.333h7".
 */
export function compact(
  strings: TemplateStringsArray,
  ...values: (number | string)[]
): string {
  let out = strings[0] ?? "";
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    out +=
      (typeof value === "number" ? fmt(value) : value) + (strings[i + 1] ?? "");
  }
  return out;
}
