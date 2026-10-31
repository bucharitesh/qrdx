"use client";

import { cn } from "@repo/design-system/lib/utils";
import { useEffect, useRef } from "react";
import {
  approach,
  createLoop,
  hash2,
  isInteractive,
  luminance,
  observeSize,
  observeTheme,
  observeVisibility,
  type RGB,
  readColor,
  rgba,
  sizeCanvas,
  smoothstep,
  trackPointer,
  valueNoise,
} from "./engine";
import { QRDX_QR_M, TILE, tiledFinder, tiledModule } from "./qr-matrix";

interface QrMosaicProps {
  className?: string;
  /** Module pitch, CSS px. */
  module?: number;
  /** Rows of "0"/"1": the real code the mosaic resolves into on hover. */
  code?: readonly string[];
}

const RADIUS = 130;
const QUIET = 2;
const MORPH_MS = 650;
const SWEEP_MS = 2200;
const SWEEP_EVERY: [number, number] = [5200, 8200];
const BEAM = 46;
const IDLE_MS = 1400;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * A field of QR modules that fills its (relative) parent. Modules near a
 * mouse pop and brighten under a soft spotlight; now and then a scan line
 * sweeps across and flips a few modules as it passes; while the pointer is
 * over the field, the middle resolves into a real, scannable code. One rAF
 * loop that sleeps between sweeps and when nothing moves; static on touch and
 * with reduced motion.
 */
export function QrMosaic({
  className,
  module = 7,
  code = QRDX_QR_M,
}: QrMosaicProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const host = canvas?.parentElement;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !host || !ctx) return;
    const base = document.createElement("canvas");
    const bctx = base.getContext("2d");
    const sprite = document.createElement("canvas");
    const sctx = sprite.getContext("2d");
    if (!bctx || !sctx) return;

    const interactive = isInteractive();
    const size = code.length;

    let dpr = 1;
    let cols = 0;
    let rows = 0;
    let pitch = 1; // device px
    let dot = 1; // device px
    let x0 = 0;
    let y0 = 0;
    let color: RGB = [128, 128, 128];
    let dark = true;
    let on = new Uint8Array(0);
    let alpha = new Float32Array(0);
    let stamp = new Uint32Array(0);
    let frame = 1;
    // The resolved code's top-left module, and whether it fits.
    let qx = 0;
    let qy = 0;
    let fits = false;
    let visible = false;
    let px = -1e4;
    let py = -1e4;
    let energy = 0;
    let morph = 0;
    let sweepStart = -1;
    let sweepCount = 0;
    let lastBeamCol = -1;
    let sweepTimer = 0;

    const readTheme = () => {
      color = readColor(canvas);
      dark = luminance(color) > 0.5;
    };

    const drawSprite = () => {
      sprite.width = dot;
      sprite.height = dot;
      sctx.clearRect(0, 0, dot, dot);
      sctx.fillStyle = rgba(color, 1);
      sctx.beginPath();
      const r = dot * 0.24;
      if (typeof sctx.roundRect === "function")
        sctx.roundRect(0, 0, dot, dot, r);
      else sctx.rect(0, 0, dot, dot);
      sctx.fill();
    };

    const inCode = (c: number, r: number) =>
      fits &&
      c >= qx - QUIET &&
      c < qx + size + QUIET &&
      r >= qy - QUIET &&
      r < qy + size + QUIET;
    const codeOn = (c: number, r: number) => code[r - qy]?.[c - qx] === "1";

    const paint = (
      target: CanvasRenderingContext2D,
      c: number,
      r: number,
      a: number,
      scale = 1,
    ) => {
      if (a <= 0.004) return;
      const s = dot * scale;
      const cx = x0 + c * pitch + pitch / 2;
      const cy = y0 + r * pitch + pitch / 2;
      target.globalAlpha = Math.min(1, a);
      target.drawImage(sprite, cx - s / 2, cy - s / 2, s, s);
    };

    const clearCell = (
      target: CanvasRenderingContext2D,
      c: number,
      r: number,
    ) => target.clearRect(x0 + c * pitch, y0 + r * pitch, pitch, pitch);

    const baseAlpha = (c: number, r: number) => {
      const n = valueNoise(c / TILE / 1.2 + 0.4, r / TILE / 1.2 + 0.9);
      const k = smoothstep(clamp01((n - 0.2) / 0.65));
      return (dark ? 0.055 : 0.07) + (dark ? 0.085 : 0.1) * k;
    };

    const build = () => {
      const n = cols * rows;
      on = new Uint8Array(n);
      alpha = new Float32Array(n);
      stamp = new Uint32Array(n);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c;
          on[i] = tiledModule(c, r) ? 1 : 0;
          alpha[i] = baseAlpha(c, r);
        }
      }
    };

    const drawBase = () => {
      base.width = canvas.width;
      base.height = canvas.height;
      bctx.clearRect(0, 0, base.width, base.height);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c;
          if (on[i]) paint(bctx, c, r, alpha[i] ?? 0);
        }
      }
      bctx.globalAlpha = 1;
    };

    const scheduleSweep = () => {
      window.clearTimeout(sweepTimer);
      if (!interactive || !visible) return;
      const [a, b] = SWEEP_EVERY;
      sweepTimer = window.setTimeout(
        () => {
          if (!visible) return;
          sweepStart = performance.now();
          lastBeamCol = -1;
          sweepCount++;
          loop.wake();
        },
        a + Math.random() * (b - a),
      );
    };

    const render = (now: number) => {
      frame++;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(base, 0, 0);

      const pxd = px * dpr;
      const pyd = py * dpr;
      const rd = RADIUS * dpr;
      const phase = now * 0.006;

      // Scan line position (device px) and its column.
      let beamX = -1e5;
      if (sweepStart >= 0) {
        const p = (now - sweepStart) / SWEEP_MS;
        beamX =
          -BEAM * dpr +
          smoothstep(clamp01(p)) * (canvas.width + 2 * BEAM * dpr);
        // Flip a few modules behind the line (never finder patterns).
        const col = Math.floor((beamX - x0) / pitch);
        for (
          let c = Math.max(0, lastBeamCol + 1);
          c <= Math.min(cols - 1, col);
          c++
        ) {
          for (let r = 0; r < rows; r++) {
            if (inCode(c, r) || tiledFinder(c, r)) continue;
            if (hash2(c * 31 + sweepCount * 7, r * 17 + sweepCount) < 0.045) {
              const i = r * cols + c;
              on[i] = on[i] ? 0 : 1;
              clearCell(bctx, c, r);
              if (on[i]) paint(bctx, c, r, alpha[i] ?? 0);
              bctx.globalAlpha = 1;
            }
          }
        }
        lastBeamCol = Math.max(lastBeamCol, col);
      }

      const visit = (c: number, r: number) => {
        const i = r * cols + c;
        if (stamp[i] === frame) return;
        stamp[i] = frame;
        let a = on[i] ? (alpha[i] ?? 0) : 0;
        let s = 1;
        const cx = x0 + c * pitch + pitch / 2;
        const cy = y0 + r * pitch + pitch / 2;
        let resolved = 0;
        if (morph > 0 && inCode(c, r)) {
          const dx = (c - (qx + size / 2)) / (size / 2 + QUIET);
          const dy = (r - (qy + size / 2)) / (size / 2 + QUIET);
          const d = Math.min(1, Math.hypot(dx, dy) / 1.42);
          resolved = smoothstep(clamp01(morph * 1.7 - d * 0.7));
          const target = codeOn(c, r) ? (dark ? 0.82 : 0.86) : 0;
          a += (target - a) * resolved;
          s += 0.4 * Math.sin(resolved * Math.PI);
        }
        if (beamX > -1e4 && resolved < 0.5) {
          const f = clamp01(1 - Math.abs(cx - beamX) / (BEAM * dpr));
          if (f > 0) {
            a += (on[i] ? 0.32 : 0.07) * f * f;
            s += 0.12 * f;
          }
        }
        if (energy > 0 && resolved < 0.5) {
          const d = Math.hypot(cx - pxd, cy - pyd);
          if (d < rd) {
            const t = smoothstep(1 - d / rd) * energy;
            const wave = 0.5 + 0.5 * Math.sin((d / dpr) * 0.09 - phase);
            if (on[i])
              a += ((dark ? 0.55 : 0.6) - a) * t * (0.55 + 0.45 * wave);
            else a = Math.max(a, 0.05 * t * wave);
            s += 0.38 * t * (0.6 + 0.4 * wave);
          }
        }
        clearCell(ctx, c, r);
        paint(ctx, c, r, a, Math.min(s, 1.5));
      };

      const span = (cx0: number, cx1: number, cy0: number, cy1: number) => {
        const c0 = Math.max(0, Math.floor((cx0 - x0) / pitch));
        const c1 = Math.min(cols - 1, Math.floor((cx1 - x0) / pitch));
        const r0 = Math.max(0, Math.floor((cy0 - y0) / pitch));
        const r1 = Math.min(rows - 1, Math.floor((cy1 - y0) / pitch));
        for (let r = r0; r <= r1; r++)
          for (let c = c0; c <= c1; c++) visit(c, r);
      };

      if (beamX > -1e4)
        span(
          beamX - BEAM * dpr - pitch,
          beamX + BEAM * dpr + pitch,
          0,
          canvas.height,
        );
      if (energy > 0) span(pxd - rd, pxd + rd, pyd - rd, pyd + rd);
      if (morph > 0 && fits)
        span(
          x0 + (qx - QUIET) * pitch,
          x0 + (qx + size + QUIET) * pitch - 1,
          y0 + (qy - QUIET) * pitch,
          y0 + (qy + size + QUIET) * pitch - 1,
        );
      ctx.globalAlpha = 1;

      // The scan line itself, with a faint trail.
      if (beamX > -1e4) {
        const grad = ctx.createLinearGradient(
          beamX - BEAM * 2 * dpr,
          0,
          beamX,
          0,
        );
        grad.addColorStop(0, rgba(color, 0));
        grad.addColorStop(1, rgba(color, dark ? 0.05 : 0.06));
        ctx.fillStyle = grad;
        ctx.fillRect(beamX - BEAM * 2 * dpr, 0, BEAM * 2 * dpr, canvas.height);
        ctx.fillStyle = rgba(color, dark ? 0.32 : 0.36);
        ctx.fillRect(Math.round(beamX), 0, Math.max(1, dpr), canvas.height);
      }

      // Soft spotlight under everything.
      if (energy > 0) {
        ctx.globalCompositeOperation = "destination-over";
        const g = ctx.createRadialGradient(pxd, pyd, 0, pxd, pyd, rd * 1.3);
        g.addColorStop(0, rgba(color, (dark ? 0.07 : 0.06) * energy));
        g.addColorStop(1, rgba(color, 0));
        ctx.fillStyle = g;
        ctx.fillRect(pxd - rd * 1.3, pyd - rd * 1.3, rd * 2.6, rd * 2.6);
        ctx.globalCompositeOperation = "source-over";
      }
    };

    const pointer = interactive
      ? trackPointer(host, () => visible && loop.wake())
      : null;

    const loop = createLoop((now, dt) => {
      const s = pointer?.state;
      const inside = Boolean(s?.inside);
      const active = inside && now - (s?.moved ?? 0) < IDLE_MS;
      if (s && inside) {
        if (px < -1e3) {
          px = s.x;
          py = s.y;
        }
        px = approach(px, s.x, 0.25, dt);
        py = approach(py, s.y, 0.25, dt);
      }
      const target = active ? 1 : 0;
      energy = approach(energy, target, 0.1, dt);
      if (Math.abs(energy - target) < 0.004) energy = target;
      const want = inside ? 1 : 0;
      const step = dt / MORPH_MS;
      morph =
        want > morph ? Math.min(1, morph + step) : Math.max(0, morph - step);
      if (sweepStart >= 0 && now - sweepStart > SWEEP_MS) {
        sweepStart = -1;
        scheduleSweep();
      }
      render(now);
      return active || energy !== target || morph !== want || sweepStart >= 0;
    });

    const layout = (cssW: number, cssH: number) => {
      dpr = sizeCanvas(canvas, cssW, cssH);
      pitch = Math.max(2, Math.round(module * dpr));
      dot = Math.max(1, Math.round(pitch * 0.74));
      cols = Math.ceil(canvas.width / pitch);
      rows = Math.ceil(canvas.height / pitch);
      x0 = Math.round((canvas.width - cols * pitch) / 2);
      y0 = Math.round((canvas.height - rows * pitch) / 2);
      fits = rows >= size + QUIET * 2 && cols >= size + QUIET * 2;
      qx = Math.floor((cols - size) / 2);
      qy = Math.floor((rows - size) / 2);
      drawSprite();
      build();
      drawBase();
      render(performance.now());
    };

    readTheme();
    const stopSize = observeSize(canvas, layout);
    const stopTheme = observeTheme(() => {
      readTheme();
      drawSprite();
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) alpha[r * cols + c] = baseAlpha(c, r);
      drawBase();
      render(performance.now());
    });
    const stopVisible = observeVisibility(canvas, (v) => {
      visible = v;
      if (!v) {
        window.clearTimeout(sweepTimer);
        loop.stop();
        return;
      }
      if (interactive) {
        // First sweep soon after it comes into view.
        window.clearTimeout(sweepTimer);
        sweepTimer = window.setTimeout(() => {
          if (!visible) return;
          sweepStart = performance.now();
          lastBeamCol = -1;
          sweepCount++;
          loop.wake();
        }, 700);
      }
      loop.wake();
    });

    return () => {
      window.clearTimeout(sweepTimer);
      loop.stop();
      pointer?.dispose();
      stopSize();
      stopTheme();
      stopVisible();
    };
  }, [module, code]);

  return (
    // biome-ignore lint/a11y/noAriaHiddenOnFocusable: a canvas without tabIndex is not focusable; it is decorative
    <canvas
      ref={ref}
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 size-full text-foreground",
        className,
      )}
    />
  );
}
