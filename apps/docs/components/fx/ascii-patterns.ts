// The newer AsciiField patterns: topo, ramp, halo, rain and scan. Each is a
// spec for the shared renderer in ascii.ts (cached glyph atlas, patch repaint
// around the pointer). Rain and scan add slow ambient motion that repaints
// only the cells that change. Light mode is tuned on its own via `tone`:
// fewer specks and no heavy glyphs, which read as dirt on a light page.

import type { AsciiAmbient, AsciiRegion, AsciiSpec, Cell } from "./ascii";
import { hash2, smoothstep, valueNoise } from "./engine";
import { RAMP } from "./glyphs";

export interface PatternOptions {
  cellW: number;
  cellH: number;
  radius: number;
  /** Varies the pattern between instances. */
  seed: number;
  /** Focal point as fractions of the field: [x, y]. */
  focus: readonly [number, number];
}

const LAST = RAMP.length - 1;
const SCRAMBLE = [2, 3, 4, 5, 6, 7] as const;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** −0.5…0.5 per cell, so density steps dither instead of banding. */
const dither = (c: number, r: number, seed: number) =>
  hash2(c * 31 + seed, r * 17 + 7) - 0.5;

/** Shared pointer response: glyphs densify and brighten in the lens. */
function densify(t: number, wave: number, out: Cell, peak = 0.4) {
  out.g = Math.min(LAST, out.g + Math.round(t * (1 + 2.5 * wave)));
  if (out.g === 0 && t > 0.35) out.g = 1;
  out.a += (peak - out.a) * t * (0.45 + 0.55 * wave);
}

/** A density ramp ` .:-=+*#%@` fading out from one corner (the focus). */
export function rampSpec(o: PatternOptions): AsciiSpec {
  let dark = true;
  const [fx, fy] = o.focus;
  return {
    chars: RAMP,
    cellW: o.cellW,
    cellH: o.cellH,
    radius: o.radius,
    scramble: SCRAMBLE,
    tone(d) {
      dark = d;
    },
    base(c, r, cols, rows, out) {
      const w = cols * o.cellW;
      const h = rows * o.cellH;
      const dx = (c + 0.5) * o.cellW - fx * w;
      const dy = (r + 0.5) * o.cellH - fy * h;
      const reach = Math.min(Math.hypot(w, h) * 0.62, 1100);
      let v = 1 - Math.min(1, Math.hypot(dx, dy) / reach);
      v = v ** 2.2 * (0.8 + 0.4 * valueNoise(c * 0.05 + o.seed, r * 0.1));
      // Soften the field's own edges so the corner never ends in a hard cut.
      const x = (c + 0.5) * o.cellW;
      const y = (r + 0.5) * o.cellH;
      const edge = Math.min(x, w - x, y, h - y);
      v *= 0.3 + 0.7 * smoothstep(clamp01(edge / 110));
      v = clamp01(v + dither(c, r, o.seed) * 0.14);
      const g = Math.round(v * (dark ? LAST - 2 : LAST - 4));
      out.g = !dark && g < 2 ? 0 : g;
      out.a = dark ? 0.03 + 0.13 * v : 0.028 + 0.1 * v;
    },
    hot(_c, _r, t, wave, out) {
      densify(t, wave, out);
    },
  };
}

/**
 * A radial density glow around the focus, hollow in the middle so text or a
 * card on top keeps its contrast. Faint concentric rings give it grain.
 */
export function haloSpec(o: PatternOptions): AsciiSpec {
  let dark = true;
  const [fx, fy] = o.focus;
  return {
    chars: RAMP,
    cellW: o.cellW,
    cellH: o.cellH,
    radius: o.radius,
    scramble: SCRAMBLE,
    tone(d) {
      dark = d;
    },
    base(c, r, cols, rows, out) {
      const w = cols * o.cellW;
      const h = rows * o.cellH;
      const rx = Math.max(w * 0.36, 240);
      const ry = Math.max(h * 0.55, 200);
      const dx = (c + 0.5) * o.cellW - fx * w;
      const dy = (r + 0.5) * o.cellH - fy * h;
      const d = Math.hypot(dx / rx, dy / ry);
      const glow = 1 - smoothstep(clamp01(d));
      const core = smoothstep(clamp01((d - 0.04) / 0.4));
      let v = glow * (0.3 + 0.7 * core);
      v *= 0.84 + 0.16 * Math.cos(d * 19 - o.seed);
      v = clamp01(v + dither(c, r, o.seed) * 0.14);
      const g = Math.round(v * (dark ? LAST : LAST - 3));
      out.g = !dark && g < 2 ? 0 : g;
      out.a = dark ? 0.03 + 0.16 * v : 0.025 + 0.12 * v;
    },
    hot(_c, _r, t, wave, out) {
      densify(t, wave, out);
    },
  };
}

// Contour glyphs: index 1 "-", 2 "|", 3 "/", 4 "\".
const TOPO = " -|/\\";
const LEVELS = 10;

/**
 * Topographic contour lines drawn with characters: each glyph follows the
 * local direction of its line, every fourth line is an index contour. The
 * pointer raises a low hill, so nearby lines bend around it.
 */
export function topoSpec(o: PatternOptions): AsciiSpec {
  let dark = true;
  let cols = 0;
  let field = new Float32Array(0);
  let gxs = new Float32Array(0);
  let gys = new Float32Array(0);
  const sx = o.seed * 3.17;
  const sy = o.seed * 1.91;
  const height = (x: number, y: number) =>
    valueNoise(x / 270 + sx, y / 270 + sy) * 0.66 +
    valueNoise(x / 115 + sx * 2 + 5, y / 115 + sy + 9) * 0.34;

  /** Glyph for a cell whose contour is `dist` px away, or 0. */
  const contour = (v: number, gx: number, gy: number) => {
    const g = Math.hypot(gx, gy);
    if (g < 1e-7) return 0;
    const k = Math.round(v);
    const dist = Math.abs(v - k) / (g * LEVELS);
    const nx = gx / g;
    const ny = gy / g;
    const half = 0.44 * (Math.abs(nx) * o.cellW + Math.abs(ny) * o.cellH);
    if (dist > half) return 0;
    // The line runs along (-ny, nx); pick the glyph for its screen angle.
    let deg = (Math.atan2(nx, -ny) * 180) / Math.PI;
    if (deg < 0) deg += 180;
    if (deg < 24 || deg >= 156) return 1;
    if (deg >= 68 && deg < 112) return 2;
    return deg < 90 ? 4 : 3;
  };
  const alphaFor = (v: number, c: number, r: number) => {
    const index = Math.round(v) % 4 === 0;
    const shade = 0.75 + 0.25 * valueNoise(c * 0.03 + 11, r * 0.06 + sy);
    return (index ? (dark ? 0.2 : 0.17) : dark ? 0.11 : 0.095) * shade;
  };

  return {
    chars: TOPO,
    cellW: o.cellW,
    cellH: o.cellH,
    radius: o.radius,
    scramble: [1, 2, 3, 4],
    tone(d) {
      dark = d;
    },
    base(c, r, nc, nr, out) {
      if (c === 0 && r === 0) {
        cols = nc;
        field = new Float32Array(nc * nr);
        gxs = new Float32Array(nc * nr);
        gys = new Float32Array(nc * nr);
      }
      const x = (c + 0.5) * o.cellW;
      const y = (r + 0.5) * o.cellH;
      const e = 2;
      const f = height(x, y);
      const gx = (height(x + e, y) - height(x - e, y)) / (2 * e);
      const gy = (height(x, y + e) - height(x, y - e)) / (2 * e);
      const i = r * nc + c;
      field[i] = f;
      gxs[i] = gx;
      gys[i] = gy;
      out.g = contour(f * LEVELS, gx, gy);
      out.a = out.g ? alphaFor(f * LEVELS, c, r) : 0;
    },
    hot(c, r, t, wave, out) {
      const i = r * cols + c;
      // A hill under the pointer: up to ~0.7 of a contour interval.
      const v = (field[i] ?? 0) * LEVELS + 0.7 * t;
      const g = contour(v, gxs[i] ?? 0, gys[i] ?? 0);
      out.g = g;
      if (!g) return;
      const a = alphaFor(v, c, r);
      out.a = a + (0.42 - a) * t * (0.4 + 0.6 * wave);
    },
  };
}

// Rain glyphs: the ramp, then digits.
const RAIN = `${RAMP}0123456789`;
const DIGIT0 = RAMP.length;

/**
 * Very slow falling characters in sparse columns: Matrix-like, but calm and
 * monochrome. About one column in five carries a drop with a fading tail.
 */
export function rainSpec(o: PatternOptions): AsciiSpec {
  let dark = true;
  let rows = 0;
  let speed = new Float32Array(0);
  let tail = new Float32Array(0);
  let period = new Float32Array(0);
  let phase = new Float32Array(0);
  let lanes: number[] = [];

  const init = (nc: number, nr: number) => {
    rows = nr;
    speed = new Float32Array(nc);
    tail = new Float32Array(nc);
    period = new Float32Array(nc);
    phase = new Float32Array(nc);
    lanes = [];
    for (let c = 0; c < nc; c++) {
      if (hash2(c * 3 + o.seed, 91) > 0.21) continue;
      speed[c] = 0.9 + 1.5 * hash2(c, 7 + o.seed); // rows per second
      tail[c] = 5 + Math.floor(hash2(c, 13) * 9);
      period[c] = nr + (tail[c] ?? 0) + nr * (0.4 + 1.2 * hash2(c, 29));
      phase[c] = hash2(c, 41 + o.seed) * (period[c] ?? 1);
      lanes.push(c);
    }
  };
  /** Head row of column c's drop (fractional; the tail trails above it). */
  const head = (c: number, now: number) =>
    ((now / 1000) * (speed[c] ?? 0) + (phase[c] ?? 0)) % (period[c] ?? 1);

  const ambient: AsciiAmbient = {
    step: 50,
    still: 21_000,
    wait: () => 0,
    regions(now) {
      const list: AsciiRegion[] = [];
      for (const c of lanes) {
        const y = head(c, now);
        const r1 = Math.floor(y);
        const r0 = Math.floor(y - (tail[c] ?? 0));
        if (r1 < 0 || r0 >= rows) continue;
        list.push({ c0: c, c1: c, r0, r1 });
      }
      return list;
    },
    live(c, r, now, out) {
      const s = speed[c];
      if (!s) return;
      const d = head(c, now) - r;
      const len = tail[c] ?? 1;
      if (d < 0 || d >= len) return;
      const a = (dark ? 0.32 : 0.25) * (1 - d / len) ** 1.6;
      if (a <= out.a) return;
      out.a = a;
      const flip = Math.floor(now / 1100 + hash2(c, r) * 4);
      out.g = DIGIT0 + Math.floor(hash2(c * 7 + flip, r * 3) * 10);
    },
  };

  return {
    chars: RAIN,
    cellW: o.cellW,
    cellH: o.cellH,
    radius: o.radius,
    scramble: [DIGIT0, DIGIT0 + 1, 2, 3],
    tone(d) {
      dark = d;
    },
    ambient,
    base(c, r, nc, nr, out) {
      if (c === 0 && r === 0) init(nc, nr);
      // Sparse residue between the drops.
      const n = hash2(c + o.seed * 13, r * 5 + 1);
      if (n > (dark ? 0.982 : 0.988)) {
        out.g = n > 0.995 ? 2 : 1;
        out.a = 0.06;
      }
    },
    hot(c, r, t, wave, out) {
      if (out.g > 0) {
        out.a += (0.44 - out.a) * t * (0.4 + 0.6 * wave);
        return;
      }
      if (t > 0.3 && hash2(c * 5, r * 9) > 0.62) {
        out.g = DIGIT0 + Math.floor(hash2(c, r * 7) * 10);
        out.a = 0.16 * t;
      }
    },
  };
}

const SCAN_SPEED = 7; // rows per second
const SCAN_REST = 5200; // ms between passes
const SCAN_TRAIL = 7;
const SCAN_LEAD = 1.5;

/**
 * A sparse field crossed by a slow horizontal scan line now and then; the
 * characters densify as it passes and settle back behind it.
 */
export function scanSpec(o: PatternOptions): AsciiSpec {
  let dark = true;
  let cols = 0;
  let rows = 0;
  const offset = hash2(o.seed, 3) * 4000;
  const passMs = () =>
    ((rows + SCAN_TRAIL + SCAN_LEAD + 2) / SCAN_SPEED) * 1000;
  const periodMs = () => passMs() + SCAN_REST;
  /** Row of the scan line at `now`, or null between passes. */
  const lineAt = (now: number) => {
    const p = (now + offset) % periodMs();
    return p < passMs() ? (p / 1000) * SCAN_SPEED - SCAN_LEAD - 1 : null;
  };

  const ambient: AsciiAmbient = {
    step: 33,
    // The still frame (reduced motion) holds the line at the focus row, by
    // default high up, clear of a centred headline.
    get still() {
      const p = ((rows * o.focus[1] + SCAN_LEAD + 1) / SCAN_SPEED) * 1000;
      return p - offset + periodMs() * 4;
    },
    wait(now) {
      const p = (now + offset) % periodMs();
      return p < passMs() ? 0 : periodMs() - p;
    },
    regions(now) {
      const y = lineAt(now);
      if (y === null) return [];
      return [
        {
          c0: 0,
          c1: cols - 1,
          r0: Math.floor(y - SCAN_TRAIL),
          r1: Math.ceil(y + SCAN_LEAD),
        },
      ];
    },
    live(c, r, now, out) {
      const y = lineAt(now);
      if (y === null) return;
      const d = r - y; // > 0 ahead of the line, < 0 behind it
      if (d > SCAN_LEAD || d < -SCAN_TRAIL) return;
      const b = d >= 0 ? 1 - d / SCAN_LEAD : Math.exp(d / 2.6);
      const n = hash2(c * 5 + o.seed, r * 11);
      const level = Math.round(b * (3 + 5 * n)) + (b > 0.8 ? 1 : 0);
      out.g = Math.min(dark ? LAST - 1 : LAST - 3, Math.max(out.g, level));
      out.a += ((dark ? 0.24 : 0.19) - out.a) * b;
    },
  };

  return {
    chars: RAMP,
    cellW: o.cellW,
    cellH: o.cellH,
    radius: o.radius,
    scramble: SCRAMBLE,
    tone(d) {
      dark = d;
    },
    ambient,
    base(c, r, nc, nr, out) {
      if (c === 0 && r === 0) {
        cols = nc;
        rows = nr;
      }
      const n =
        valueNoise(c * 0.07 + o.seed, r * 0.14) * 0.65 +
        valueNoise(c * 0.2 + 3, r * 0.4 + o.seed) * 0.35;
      const v = smoothstep(clamp01((n - 0.42) / 0.45));
      out.g = v > 0.08 ? Math.max(1, Math.round(v * 3)) : 0;
      if (!dark && out.g === 1 && hash2(c, r) < 0.5) out.g = 0;
      out.a = 0.035 + 0.07 * v;
    },
    hot(_c, _r, t, wave, out) {
      densify(t, wave, out);
    },
  };
}
