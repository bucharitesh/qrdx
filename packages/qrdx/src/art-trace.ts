/** biome-ignore-all lint/style/noMagicNumbers: palette and contour constants */
// Vectorizes the small RGBA logo bitmap stored in `art.image` into flat-color
// layers, so Logo QR draws a crisp logo (smooth vector edges at any export
// size) instead of a blocky color grid. Everything stays plain filled paths,
// which the SVG, PNG, PDF and EPS outputs all draw the same way.
//
// 1. Palette: the logo's main flat colors (a histogram of opaque pixels).
// 2. Soft membership: each pixel's share of its nearest palette colors, so
//    anti-aliased edges keep their sub-pixel position.
// 3. Stacked layers: largest color at the bottom; layer k covers every pixel
//    whose colors from k upwards add up to at least half, so neighbouring
//    colors meet without seams.
// 4. Marching squares at the 0.5 level, then Douglas–Peucker simplification
//    and gently rounded corners.

/** sRGB color, channels 0–1 (gamma encoded) */
export type RGB = [number, number, number];

export interface ArtBitmap {
  width: number;
  height: number;
  data: Uint8Array;
}

export interface PaletteColor {
  color: RGB;
  /** Share of the logo's opaque area, 0–1 */
  area: number;
  /** Area-weighted center, in image pixels */
  cx: number;
  cy: number;
}

export interface TracedLogo {
  width: number;
  height: number;
  /** Layers bottom to top; `d` is SVG path data in image pixels */
  layers: { color: RGB; d: string }[];
  /** Largest first */
  palette: PaletteColor[];
  /**
   * True when the image is photographic (many colors, no flat regions): the
   * logo is then drawn as a fine pixel mosaic instead of traced shapes.
   */
  photographic: boolean;
  /** Opaque logo pixels' coverage of the image box, 0–1 */
  coverage: number;
  /** Per-pixel opacity after backdrop removal, 0–1 */
  alpha: Float32Array;
}

const srgb = (byte: number) => byte / 255;

const distance2 = (a: RGB, b: RGB) =>
  (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/** Luma of a gamma-encoded color, as camera binarizers see it. */
export const luma = (c: RGB) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/**
 * Logos saved as JPEG (or with a solid backdrop) have no transparency: when
 * the four corners share one opaque color, treat that color as background.
 */
export function backdropColor(image: ArtBitmap): RGB | null {
  const { width, height, data } = image;
  const corners = [0, width - 1, (height - 1) * width, height * width - 1].map(
    (index) => {
      const i = index * 4;
      return {
        color: [srgb(data[i]), srgb(data[i + 1]), srgb(data[i + 2])] as RGB,
        alpha: data[i + 3] / 255,
      };
    }
  );
  if (corners.some((corner) => corner.alpha < 0.9)) {
    return null;
  }
  const first = corners[0].color;
  return corners.every(({ color }) => distance2(color, first) < 0.006)
    ? first
    : null;
}

/** Opacity per pixel, with a detected solid backdrop made transparent. */
function opacity(image: ArtBitmap): Float32Array {
  const { width, height, data } = image;
  const backdrop = backdropColor(image);
  const alpha = new Float32Array(width * height);
  for (let p = 0; p < alpha.length; p++) {
    const i = p * 4;
    let a = data[i + 3] / 255;
    if (backdrop && a > 0) {
      const d = Math.sqrt(
        distance2(
          [srgb(data[i]), srgb(data[i + 1]), srgb(data[i + 2])],
          backdrop
        )
      );
      // Fully backdrop below 0.06, fully logo above 0.16 (soft edge between)
      a *= Math.min(1, Math.max(0, (d - 0.06) / 0.1));
    }
    alpha[p] = a;
  }
  return alpha;
}

const MAX_COLORS = 8;
/** Palette colors closer than this (sRGB distance) merge */
const MERGE_DISTANCE = 0.14;
/** Smallest share of the logo a palette color needs */
const MIN_SHARE = 0.006;

function extractPalette(
  image: ArtBitmap,
  alpha: Float32Array
): { palette: PaletteColor[]; error: number } {
  const { width, height, data } = image;
  // 4 bits per channel histogram of solid pixels
  const count = new Float64Array(4096);
  const sums = new Float64Array(4096 * 3);
  let total = 0;
  for (let p = 0; p < alpha.length; p++) {
    if (alpha[p] < 0.9) {
      continue;
    }
    const i = p * 4;
    const bin =
      Math.floor(data[i] / 16) * 256 +
      Math.floor(data[i + 1] / 16) * 16 +
      Math.floor(data[i + 2] / 16);
    count[bin] += 1;
    sums[bin * 3] += srgb(data[i]);
    sums[bin * 3 + 1] += srgb(data[i + 1]);
    sums[bin * 3 + 2] += srgb(data[i + 2]);
    total++;
  }
  if (total === 0) {
    return { palette: [], error: 0 };
  }
  const bins = [...count.keys()]
    .filter((bin) => count[bin] > 0)
    .sort((a, b) => count[b] - count[a]);
  const centers: RGB[] = [];
  for (const bin of bins) {
    if (count[bin] / total < MIN_SHARE / 2 || centers.length >= MAX_COLORS) {
      break;
    }
    const color: RGB = [
      sums[bin * 3] / count[bin],
      sums[bin * 3 + 1] / count[bin],
      sums[bin * 3 + 2] / count[bin],
    ];
    if (centers.every((c) => distance2(c, color) >= MERGE_DISTANCE ** 2)) {
      centers.push(color);
    }
  }
  // Two k-means rounds over solid pixels to settle the colors
  let stats: {
    n: number;
    r: number;
    g: number;
    b: number;
    x: number;
    y: number;
  }[] = [];
  let error = 0;
  for (let round = 0; round < 3; round++) {
    stats = centers.map(() => ({ n: 0, r: 0, g: 0, b: 0, x: 0, y: 0 }));
    error = 0;
    for (let p = 0; p < alpha.length; p++) {
      if (alpha[p] < 0.9) {
        continue;
      }
      const i = p * 4;
      const color: RGB = [srgb(data[i]), srgb(data[i + 1]), srgb(data[i + 2])];
      let best = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const [k, center] of centers.entries()) {
        const d = distance2(color, center);
        if (d < bestDistance) {
          bestDistance = d;
          best = k;
        }
      }
      const s = stats[best];
      s.n++;
      s.r += color[0];
      s.g += color[1];
      s.b += color[2];
      s.x += p % width;
      s.y += Math.floor(p / width);
      error += Math.sqrt(bestDistance);
    }
    for (const [k, s] of stats.entries()) {
      if (s.n > 0) {
        centers[k] = [s.r / s.n, s.g / s.n, s.b / s.n];
      }
    }
  }
  const palette = centers
    .map((color, k) => ({
      color,
      area: stats[k].n / total,
      cx: stats[k].n ? stats[k].x / stats[k].n + 0.5 : width / 2,
      cy: stats[k].n ? stats[k].y / stats[k].n + 0.5 : height / 2,
    }))
    .filter((entry) => entry.area >= MIN_SHARE)
    .sort((a, b) => b.area - a.area);
  return { palette, error: error / total };
}

// ── Contours ───────────────────────────────────────────────────────────────

type Point = [number, number];

/**
 * Iso-contours of `field` (width × height samples at pixel centers) at 0.5,
 * as closed loops in image pixel coordinates; inside is where field ≥ 0.5.
 */
function contours(
  field: Float32Array,
  width: number,
  height: number
): Point[][] {
  // Padded grid so every loop closes inside it
  const w = width + 2;
  const h = height + 2;
  const value = (x: number, y: number) =>
    x <= 0 || y <= 0 || x > width || y > height
      ? 0
      : field[(y - 1) * width + (x - 1)];
  // Edge crossing ids: horizontal edge (x,y)-(x+1,y) → 2·(y·w+x),
  // vertical edge (x,y)-(x,y+1) → 2·(y·w+x)+1.
  const next = new Map<number, number>();
  const points = new Map<number, Point>();
  const crossing = (id: number): Point => {
    const cached = points.get(id);
    if (cached) {
      return cached;
    }
    const cell = Math.floor(id / 2);
    const x = cell % w;
    const y = Math.floor(cell / w);
    const a = value(x, y);
    const vertical = id % 2 === 1;
    const b = vertical ? value(x, y + 1) : value(x + 1, y);
    const t = a === b ? 0.5 : Math.min(1, Math.max(0, (0.5 - a) / (b - a)));
    // Sample (x, y) sits at pixel center (x − 0.5, y − 0.5) in image space.
    const point: Point = vertical
      ? [x - 0.5, y - 0.5 + t]
      : [x - 0.5 + t, y - 0.5];
    points.set(id, point);
    return point;
  };
  const link = (from: number, to: number) => {
    next.set(from, to);
  };
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const tl = value(x, y) >= 0.5;
      const tr = value(x + 1, y) >= 0.5;
      const br = value(x + 1, y + 1) >= 0.5;
      const bl = value(x, y + 1) >= 0.5;
      const top = 2 * (y * w + x);
      const bottom = 2 * ((y + 1) * w + x);
      const left = 2 * (y * w + x) + 1;
      const right = 2 * (y * w + x + 1) + 1;
      // Segments keep the inside on their left (y-down space), so loops are
      // consistent; `link(a, b)` walks from edge a to edge b.
      const code = (tl ? 8 : 0) + (tr ? 4 : 0) + (br ? 2 : 0) + (bl ? 1 : 0);
      switch (code) {
        case 1:
          link(bottom, left);
          break;
        case 2:
          link(right, bottom);
          break;
        case 3:
          link(right, left);
          break;
        case 4:
          link(top, right);
          break;
        case 5: {
          const center =
            (value(x, y) +
              value(x + 1, y) +
              value(x + 1, y + 1) +
              value(x, y + 1)) /
            4;
          if (center >= 0.5) {
            link(top, left);
            link(bottom, right);
          } else {
            link(top, right);
            link(bottom, left);
          }
          break;
        }
        case 6:
          link(top, bottom);
          break;
        case 7:
          link(top, left);
          break;
        case 8:
          link(left, top);
          break;
        case 9:
          link(bottom, top);
          break;
        case 10: {
          const center =
            (value(x, y) +
              value(x + 1, y) +
              value(x + 1, y + 1) +
              value(x, y + 1)) /
            4;
          if (center >= 0.5) {
            link(left, bottom);
            link(right, top);
          } else {
            link(left, top);
            link(right, bottom);
          }
          break;
        }
        case 11:
          link(right, top);
          break;
        case 12:
          link(left, right);
          break;
        case 13:
          link(bottom, right);
          break;
        case 14:
          link(left, bottom);
          break;
        default:
          break;
      }
    }
  }
  const loops: Point[][] = [];
  for (const start of next.keys()) {
    if (!next.has(start)) {
      continue;
    }
    const loop: Point[] = [];
    let id: number | undefined = start;
    while (id !== undefined && next.has(id)) {
      loop.push(crossing(id));
      const following: number | undefined = next.get(id);
      next.delete(id);
      id = following;
    }
    if (loop.length >= 3) {
      loops.push(loop);
    }
  }
  return loops;
}

function signedArea(loop: Point[]): number {
  let area = 0;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area / 2;
}

/** Douglas–Peucker on an open polyline (keeps both ends). */
function simplifyOpen(points: Point[], epsilon: number): Point[] {
  if (points.length <= 2) {
    return points;
  }
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [from, to] = stack.pop() as [number, number];
    const a = points[from];
    const b = points[to];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const length = Math.hypot(dx, dy) || 1;
    let farthest = -1;
    let farthestDistance = epsilon;
    for (let i = from + 1; i < to; i++) {
      const p = points[i];
      const d = Math.abs(dy * (p[0] - a[0]) - dx * (p[1] - a[1])) / length;
      if (d > farthestDistance) {
        farthestDistance = d;
        farthest = i;
      }
    }
    if (farthest >= 0) {
      keep[farthest] = 1;
      stack.push([from, farthest], [farthest, to]);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
}

function simplifyLoop(loop: Point[], epsilon: number): Point[] {
  // Split at the point farthest from the first, simplify both halves.
  let far = 0;
  let farDistance = -1;
  for (const [i, p] of loop.entries()) {
    const d = (p[0] - loop[0][0]) ** 2 + (p[1] - loop[0][1]) ** 2;
    if (d > farDistance) {
      farDistance = d;
      far = i;
    }
  }
  const first = simplifyOpen(loop.slice(0, far + 1), epsilon);
  const second = simplifyOpen([...loop.slice(far), loop[0]], epsilon);
  return [...first.slice(0, -1), ...second.slice(0, -1)];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Closed path through `loop` with corners rounded by at most `radius`. */
function smoothPath(loop: Point[], radius: number): string {
  const n = loop.length;
  const toward = (from: Point, to: Point): Point => {
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
    const t = Math.min(0.5, radius / length);
    return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
  };
  let d = "";
  for (let i = 0; i < n; i++) {
    const p = loop[i];
    const a = toward(p, loop[(i - 1 + n) % n]);
    const b = toward(p, loop[(i + 1) % n]);
    d += i === 0 ? `M${r2(a[0])} ${r2(a[1])}` : `L${r2(a[0])} ${r2(a[1])}`;
    d += `Q${r2(p[0])} ${r2(p[1])} ${r2(b[0])} ${r2(b[1])}`;
  }
  return `${d}Z`;
}

function layerPath(field: Float32Array, width: number, height: number) {
  let d = "";
  for (const loop of contours(field, width, height)) {
    if (Math.abs(signedArea(loop)) < 0.8) {
      continue;
    }
    const simple = simplifyLoop(loop, 0.18);
    if (simple.length >= 3) {
      d += smoothPath(simple, 0.9);
    }
  }
  return d;
}

/** Mean distance (sRGB) above which an image counts as photographic. */
const PHOTO_ERROR = 0.075;

/** Traces a decoded art bitmap (see the file comment). */
export function traceLogo(image: ArtBitmap): TracedLogo {
  const { width, height, data } = image;
  const alpha = opacity(image);
  let opaque = 0;
  for (const a of alpha) {
    opaque += a;
  }
  const { palette, error } = extractPalette(image, alpha);
  const base = {
    width,
    height,
    palette,
    alpha,
    coverage: opaque / (width * height),
  };
  if (palette.length === 0 || error > PHOTO_ERROR) {
    return { ...base, layers: [], photographic: palette.length > 0 };
  }
  const k = palette.length;
  // fields[c] = share of palette color c at each pixel (times opacity)
  const fields = Array.from(
    { length: k },
    () => new Float32Array(width * height)
  );
  const colors = palette.map((entry) => entry.color);
  for (let p = 0; p < alpha.length; p++) {
    const a = alpha[p];
    if (a <= 0) {
      continue;
    }
    const i = p * 4;
    const color: RGB = [srgb(data[i]), srgb(data[i + 1]), srgb(data[i + 2])];
    let first = 0;
    let second = -1;
    let d1 = Number.POSITIVE_INFINITY;
    let d2 = Number.POSITIVE_INFINITY;
    for (let c = 0; c < k; c++) {
      const d = distance2(color, colors[c]);
      if (d < d1) {
        second = first;
        d2 = d1;
        first = c;
        d1 = d;
      } else if (d < d2) {
        second = c;
        d2 = d;
      }
    }
    if (second < 0 || d1 < 1e-6) {
      fields[first][p] = a;
      continue;
    }
    // Position of the color between its two nearest palette colors
    const pa = colors[first];
    const pb = colors[second];
    const ab: RGB = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
    const t = Math.min(
      1,
      Math.max(
        0,
        ((color[0] - pa[0]) * ab[0] +
          (color[1] - pa[1]) * ab[1] +
          (color[2] - pa[2]) * ab[2]) /
          (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2)
      )
    );
    fields[first][p] = a * (1 - t);
    fields[second][p] = a * t;
  }
  // Stacked layers: layer c covers where colors c…k−1 add up to ≥ 0.5.
  const layers: { color: RGB; d: string }[] = [];
  const cumulative = new Float32Array(width * height);
  const stacked: Float32Array[] = new Array(k);
  for (let c = k - 1; c >= 0; c--) {
    const field = fields[c];
    for (let p = 0; p < cumulative.length; p++) {
      cumulative[p] += field[p];
    }
    stacked[c] = cumulative.slice();
  }
  for (let c = 0; c < k; c++) {
    const d = layerPath(stacked[c], width, height);
    if (d) {
      layers.push({ color: colors[c], d });
    }
  }
  return { ...base, layers, photographic: false };
}
