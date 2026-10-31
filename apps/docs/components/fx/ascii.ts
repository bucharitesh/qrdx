// Shared canvas renderer behind AsciiField, AsciiDivider and AsciiQr: a grid
// of monospace cells painted from a glyph atlas. The static frame is drawn
// once into an offscreen canvas; a frame only repaints the patch around the
// pointer (and, once, a decode sweep on first view). The loop sleeps whenever
// nothing moves, and never runs off screen, on touch or with reduced motion.

import {
  approach,
  createLoop,
  isInteractive,
  luminance,
  observeSize,
  observeTheme,
  observeVisibility,
  prefersReducedMotion,
  type RGB,
  readColor,
  sizeCanvas,
  smoothstep,
  trackPointer,
} from "./engine";
import { type Atlas, buildAtlas, monoFamily } from "./glyphs";

/** A cell: glyph index into `chars` (0 = blank) and alpha (0…1). */
export interface Cell {
  g: number;
  a: number;
}

export interface AsciiSpec {
  /** Every glyph the field draws. Index 0 must be a space. */
  chars: string;
  /** Cell size, CSS px. Height is usually twice the width. */
  cellW: number;
  cellH: number;
  /** Pointer reach, CSS px. */
  radius: number;
  /** Grid size for a canvas of w × h CSS px (defaults to filling it). */
  grid?: (w: number, h: number) => { cols: number; rows: number };
  /** The resting frame. */
  base: (
    col: number,
    row: number,
    cols: number,
    rows: number,
    out: Cell,
  ) => void;
  /**
   * A cell under the pointer. `t` is 0…1 (closeness × strength), `wave` a
   * 0…1 ripple travelling out from the pointer. `out` holds the base cell.
   */
  hot: (col: number, row: number, t: number, wave: number, out: Cell) => void;
  /** Glyph indices the first-view decode sweep scrambles through. */
  scramble?: readonly number[];
  /** Run the decode sweep the first time the field is seen. Default true. */
  intro?: boolean;
  /**
   * Called with the theme before the base is (re)computed, so a variant can
   * tune light mode separately instead of reusing the dark values.
   */
  tone?: (dark: boolean) => void;
  /** Slow ambient motion (rain, scan) that repaints a few cells over time. */
  ambient?: AsciiAmbient;
}

/** An inclusive range of cells. */
export interface AsciiRegion {
  c0: number;
  r0: number;
  c1: number;
  r1: number;
}

export interface AsciiAmbient {
  /** Target ms between ambient frames (the loop sleeps in between). */
  step: number;
  /** ms until ambient frames are needed again; 0 while animating. */
  wait: (now: number) => number;
  /** The cells that differ from the base at `now`. */
  regions: (now: number) => readonly AsciiRegion[];
  /** Turns a base cell into its live value at `now`. Must be cheap. */
  live: (col: number, row: number, now: number, out: Cell) => void;
  /** The moment shown as a still frame under reduced motion. */
  still: number;
}

const INTRO_MS = 1100;
const INTRO_BAND = 0.14;
/** The pointer's lens fades after it rests this long. */
const IDLE_MS = 1400;

/**
 * Mounts an ASCII field on `canvas`. Pointer events are read from
 * `host` (usually the canvas's parent). Returns a cleanup function.
 */
export function mountAscii(
  canvas: HTMLCanvasElement,
  host: HTMLElement,
  spec: AsciiSpec,
): () => void {
  const ctx = canvas.getContext("2d");
  const base = document.createElement("canvas");
  const bctx = base.getContext("2d");
  if (!ctx || !bctx) return () => {};

  const interactive = isInteractive();
  const reduced = prefersReducedMotion();
  const runIntro = (spec.intro ?? true) && !reduced;
  // Ambient motion runs on touch too (it needs no pointer), never when reduced.
  const ambient = reduced ? null : (spec.ambient ?? null);
  const { cellW, cellH, radius } = spec;

  let w = 0;
  let h = 0;
  let dpr = 1;
  let cols = 0;
  let rows = 0;
  let ox = 0;
  let oy = 0;
  let color: RGB = [128, 128, 128];
  let gain = 1;
  let family = "monospace";
  let atlas: Atlas | null = null;
  let glyphs = new Uint8Array(0);
  let alphas = new Float32Array(0);
  let visible = false;
  let px = -1e4;
  let py = -1e4;
  let energy = 0;
  let introStart = -1;
  let introDone = !runIntro;
  const cell: Cell = { g: 0, a: 0 };

  const readTheme = () => {
    color = readColor(canvas);
    const dark = luminance(color) > 0.5;
    // Light text on dark needs a touch less alpha than dark text on light.
    gain = dark ? 1 : 1.15;
    spec.tone?.(dark);
  };

  const rebuildAtlas = () => {
    atlas = buildAtlas(
      spec.chars,
      Math.round(cellW * dpr),
      Math.round(cellH * dpr),
      family,
      color,
    );
  };

  const computeBase = () => {
    const n = cols * rows;
    glyphs = new Uint8Array(n);
    alphas = new Float32Array(n);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        cell.g = 0;
        cell.a = 0;
        spec.base(c, r, cols, rows, cell);
        // Reduced motion bakes one moment of the ambient motion into the still.
        if (reduced && spec.ambient)
          spec.ambient.live(c, r, spec.ambient.still, cell);
        const i = r * cols + c;
        glyphs[i] = cell.g;
        alphas[i] = cell.a;
      }
    }
  };

  // Device-pixel cell size and origin (cells snap to whole device pixels).
  let cw = 1;
  let chh = 1;
  let x0 = 0;
  let y0 = 0;

  const blit = (
    target: CanvasRenderingContext2D,
    c: number,
    r: number,
    g: number,
    a: number,
  ) => {
    if (!atlas || g <= 0 || a <= 0.003) return;
    target.globalAlpha = Math.min(1, a * gain);
    target.drawImage(
      atlas.canvas,
      g * atlas.cw,
      0,
      atlas.cw,
      atlas.ch,
      x0 + c * cw,
      y0 + r * chh,
      atlas.cw,
      atlas.ch,
    );
  };

  const drawBase = () => {
    base.width = canvas.width;
    base.height = canvas.height;
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.clearRect(0, 0, base.width, base.height);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        blit(bctx, c, r, glyphs[i] ?? 0, alphas[i] ?? 0);
      }
    }
    bctx.globalAlpha = 1;
  };

  const scramble = spec.scramble ?? [1, 2, 3, 4, 5, 6];
  const pick = (c: number, r: number, now: number) =>
    scramble[
      Math.floor(
        ((c * 73 + r * 151 + Math.floor(now / 70) * 37) >>> 0) %
          scramble.length,
      )
    ] ?? 1;

  const drawIntro = (now: number) => {
    const p = Math.min(1, (now - introStart) / INTRO_MS);
    const front = smoothstep(p) * (1 + INTRO_BAND * 2) - INTRO_BAND;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const k =
          (c / Math.max(cols, 1)) * 0.82 + (r / Math.max(rows, 1)) * 0.18;
        const i = r * cols + c;
        const a = alphas[i] ?? 0;
        if (k < front - INTRO_BAND) blit(ctx, c, r, glyphs[i] ?? 0, a);
        else if (k < front) {
          const g = glyphs[i] ?? 0;
          if (g > 0 || (c + r) % 3 === 0)
            blit(ctx, c, r, pick(c, r, now), Math.max(a, 0.08) * 1.8);
        }
      }
    }
    ctx.globalAlpha = 1;
    return p < 1;
  };

  // Ambient bookkeeping: what was live last frame (so it can be restored) and
  // a per-cell stamp so overlapping regions paint each cell once per frame.
  let prevRegions: readonly AsciiRegion[] = [];
  let stamp = new Uint32Array(0);
  let frameId = 0;
  let lensShown = false;

  const clearRegion = (g: AsciiRegion) => {
    const c0 = Math.max(0, g.c0);
    const c1 = Math.min(cols - 1, g.c1);
    const r0 = Math.max(0, g.r0);
    const r1 = Math.min(rows - 1, g.r1);
    if (c0 > c1 || r0 > r1) return;
    ctx.clearRect(
      x0 + c0 * cw,
      y0 + r0 * chh,
      (c1 - c0 + 1) * cw,
      (r1 - r0 + 1) * chh,
    );
  };

  const paintRegion = (g: AsciiRegion, now: number) => {
    if (!ambient) return;
    const c0 = Math.max(0, g.c0);
    const c1 = Math.min(cols - 1, g.c1);
    const r0 = Math.max(0, g.r0);
    const r1 = Math.min(rows - 1, g.r1);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const i = r * cols + c;
        if (stamp[i] === frameId) continue;
        stamp[i] = frameId;
        cell.g = glyphs[i] ?? 0;
        cell.a = alphas[i] ?? 0;
        ambient.live(c, r, now, cell);
        blit(ctx, c, r, cell.g, cell.a);
      }
    }
  };

  /** Repaints last frame's live cells and this frame's (restoring the rest). */
  const paintAmbient = (now: number, restore: boolean) => {
    if (!ambient) return;
    if (stamp.length !== cols * rows) stamp = new Uint32Array(cols * rows);
    frameId = (frameId + 1) >>> 0 || 1;
    const next = ambient.regions(now);
    if (restore) for (const g of prevRegions) clearRegion(g);
    for (const g of next) clearRegion(g);
    if (restore) for (const g of prevRegions) paintRegion(g, now);
    for (const g of next) paintRegion(g, now);
    prevRegions = next;
  };

  const render = (now: number, force = false) => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    if (introStart >= 0 && !introDone) {
      if (!drawIntro(now)) {
        introDone = true;
        introStart = -1;
      } else return;
    }
    const lens = energy > 0.002;
    // Ambient-only frame: touch just the cells that change.
    if (ambient && !force && !lens && !lensShown) {
      paintAmbient(now, true);
      ctx.globalAlpha = 1;
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(base, 0, 0);
    if (ambient) paintAmbient(now, false);
    lensShown = lens;
    if (!lens) {
      ctx.globalAlpha = 1;
      return;
    }

    const pxd = px * dpr;
    const pyd = py * dpr;
    const rd = radius * dpr;
    const c0 = Math.max(0, Math.floor((pxd - rd - x0) / cw));
    const c1 = Math.min(cols - 1, Math.ceil((pxd + rd - x0) / cw));
    const r0 = Math.max(0, Math.floor((pyd - rd - y0) / chh));
    const r1 = Math.min(rows - 1, Math.ceil((pyd + rd - y0) / chh));
    if (c0 > c1 || r0 > r1) return;
    ctx.clearRect(
      x0 + c0 * cw,
      y0 + r0 * chh,
      (c1 - c0 + 1) * cw,
      (r1 - r0 + 1) * chh,
    );
    const phase = now * 0.0065;
    for (let r = r0; r <= r1; r++) {
      const cy = (y0 + (r + 0.5) * chh) / dpr;
      for (let c = c0; c <= c1; c++) {
        const i = r * cols + c;
        cell.g = glyphs[i] ?? 0;
        cell.a = alphas[i] ?? 0;
        ambient?.live(c, r, now, cell);
        const cx = (x0 + (c + 0.5) * cw) / dpr;
        const d = Math.hypot(cx - px, cy - py);
        if (d < radius) {
          const t = smoothstep(1 - d / radius) * energy;
          const wave = 0.5 + 0.5 * Math.sin(d * 0.11 - phase);
          spec.hot(c, r, t, wave, cell);
        }
        blit(ctx, c, r, cell.g, cell.a);
      }
    }
    ctx.globalAlpha = 1;
  };

  // Positions are canvas-relative, so the host may be any ancestor.
  const pointer = interactive
    ? trackPointer(host, () => visible && loop.wake(), canvas)
    : null;

  const loop = createLoop((now, dt) => {
    const s = pointer?.state;
    const active = Boolean(s?.inside) && now - (s?.moved ?? 0) < IDLE_MS;
    const target = active ? 1 : 0;
    if (s && active) {
      if (px < -1e3) {
        px = s.x;
        py = s.y;
      }
      px = approach(px, s.x, 0.25, dt);
      py = approach(py, s.y, 0.25, dt);
    }
    energy = approach(energy, target, 0.1, dt);
    if (Math.abs(energy - target) < 0.004) energy = target;
    if (energy === 0) px = -1e4;
    const wasIntro = introStart >= 0 && !introDone;
    const lensBusy = wasIntro || energy > 0 || active || lensShown;
    const ambientOn = ambient !== null && visible && !document.hidden;
    const due = ambientOn && now - lastAmbient >= (ambient?.step ?? 0) - 4;
    if (lensBusy || due || !ambientOn) render(now);
    if (due) lastAmbient = now;
    const intro = introStart >= 0 && !introDone;
    // A lit lens keeps rippling; it sleeps once the pointer rests or leaves.
    if (intro || energy > 0 || active) return true;
    // Between ambient frames the loop sleeps on a timer instead of rAF.
    if (ambientOn && ambient) {
      const wait = Math.max(
        ambient.step - (now - lastAmbient),
        ambient.wait(now),
        0,
      );
      schedule(wait);
    }
    return false;
  });

  let lastAmbient = -1e9;
  let timer = 0;
  const schedule = (ms: number) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = 0;
      if (visible && !document.hidden) loop.wake();
    }, ms);
  };
  const unschedule = () => {
    window.clearTimeout(timer);
    timer = 0;
  };
  const onPageVisibility = () => {
    if (document.hidden) {
      loop.stop();
      unschedule();
    } else if (visible) loop.wake();
  };
  if (ambient) document.addEventListener("visibilitychange", onPageVisibility);

  const layout = (cssW: number, cssH: number) => {
    w = cssW;
    h = cssH;
    dpr = sizeCanvas(canvas, w, h);
    cw = Math.round(cellW * dpr);
    chh = Math.round(cellH * dpr);
    const grid = spec.grid?.(w, h) ?? {
      cols: Math.ceil(w / cellW),
      rows: Math.ceil(h / cellH),
    };
    cols = grid.cols;
    rows = grid.rows;
    // Centre the grid in the canvas.
    ox = (canvas.width - cols * cw) / 2;
    oy = (canvas.height - rows * chh) / 2;
    x0 = Math.round(ox);
    y0 = Math.round(oy);
    rebuildAtlas();
    computeBase();
    drawBase();
    render(performance.now(), true);
  };

  readTheme();
  family = monoFamily(canvas);
  const stopSize = observeSize(canvas, (cssW, cssH) => layout(cssW, cssH));
  let alive = true;
  document.fonts?.ready.then(() => {
    if (!alive) return;
    const next = monoFamily(canvas);
    if (next === family && atlas) return;
    family = next;
    if (w && h) layout(w, h);
  });
  const stopTheme = observeTheme(() => {
    readTheme();
    rebuildAtlas();
    if (spec.tone) computeBase();
    drawBase();
    render(performance.now(), true);
  });
  const stopVisible = observeVisibility(canvas, (v) => {
    visible = v;
    if (!v) {
      loop.stop();
      unschedule();
      render(performance.now(), true);
      return;
    }
    if (!introDone && introStart < 0) introStart = performance.now();
    loop.wake();
  });

  return () => {
    alive = false;
    loop.stop();
    unschedule();
    if (ambient)
      document.removeEventListener("visibilitychange", onPageVisibility);
    pointer?.dispose();
    stopSize();
    stopTheme();
    stopVisible();
  };
}
