// SVG path data for a QR code drawn from a module matrix (qr-matrix.ts):
// the body as dots or as joined square runs, the finder patterns as rounded
// rings. Pure string building, so the header's menu artwork stays static SVG.

/** Rows of "0"/"1", "1" a dark module (see qr-matrix). */
export type Matrix = readonly string[];

export interface GlyphOptions {
  /** Body modules as dots or as squares (joined into runs, so no seams). */
  shape: "dot" | "square";
  /** Corner radius of the finder patterns' outer ring, in modules. */
  eyeRadius: number;
  /** Side of a centred square left empty for a badge, in modules. */
  hole?: number;
}

const round = (v: number) => Math.round(v * 1000) / 1000;

/** Path data for a w × h rectangle at (x, y) with corner radius r. */
function rect(x: number, y: number, w: number, h: number, r = 0): string {
  if (r <= 0) return `M${x} ${y}h${w}v${h}h${-w}z`;
  const s = round(w - 2 * r);
  const t = round(h - 2 * r);
  return `M${round(x + r)} ${y}h${s}a${r} ${r} 0 0 1 ${r} ${r}v${t}a${r} ${r} 0 0 1 ${-r} ${r}h${-s}a${r} ${r} 0 0 1 ${-r} ${-r}v${-t}a${r} ${r} 0 0 1 ${r} ${-r}z`;
}

/** Is (x, y) inside one of the three 7 × 7 finder patterns? */
const inEye = (size: number, x: number, y: number) =>
  (x < 7 && y < 7) || (x >= size - 7 && y < 7) || (x < 7 && y >= size - 7);

/** The three finder patterns: ring and centre, to draw with evenodd. */
export function eyePath(size: number, radius: number): string {
  const inner = Math.max(radius - 1, 0);
  return [
    [0, 0],
    [size - 7, 0],
    [0, size - 7],
  ]
    .map(
      ([x, y]) =>
        rect(x, y, 7, 7, radius) +
        rect(x + 1, y + 1, 5, 5, inner) +
        rect(x + 2, y + 2, 3, 3, round(radius * 0.45)),
    )
    .join("");
}

/** Every dark module outside the finder patterns (and the hole, if any). */
export function bodyPath(matrix: Matrix, { shape, hole }: GlyphOptions) {
  const size = matrix.length;
  const side = hole ?? 0;
  const lo = (size - side) / 2;
  const inHole = (x: number, y: number) =>
    x >= lo && x < lo + side && y >= lo && y < lo + side;
  const dark = (x: number, y: number) =>
    x < size && matrix[y][x] === "1" && !inEye(size, x, y) && !inHole(x, y);

  let d = "";
  for (let y = 0; y < size; y++) {
    let run = -1;
    for (let x = 0; x <= size; x++) {
      const on = dark(x, y);
      if (shape === "dot") {
        if (on)
          d += `M${x + 0.08} ${y + 0.5}a0.42 0.42 0 1 0 0.84 0a0.42 0.42 0 1 0 -0.84 0z`;
        continue;
      }
      if (on && run < 0) run = x;
      if (!on && run >= 0) {
        d += rect(run, y, x - run, 1);
        run = -1;
      }
    }
  }
  return d;
}
