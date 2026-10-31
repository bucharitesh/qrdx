"use client";

import { cn } from "@repo/design-system/lib/utils";
import { useEffect, useRef } from "react";
import { type AsciiSpec, type Cell, mountAscii } from "./ascii";
import {
  haloSpec,
  type PatternOptions,
  rainSpec,
  rampSpec,
  scanSpec,
  topoSpec,
} from "./ascii-patterns";
import { smoothstep, valueNoise } from "./engine";
import { BLOCKS, RAMP } from "./glyphs";
import { tiledModule as qrModule, TILE } from "./qr-matrix";

export type AsciiVariant =
  | "qr"
  | "noise"
  | "wave"
  | "topo"
  | "ramp"
  | "rain"
  | "halo"
  | "scan";

interface AsciiFieldProps {
  className?: string;
  /**
   * "qr": QR modules as glyph density, "noise": static grain, "wave": slow
   * sine bands, "topo": contour lines, "ramp": a density ramp from a corner,
   * "rain": slow falling characters, "halo": a radial glow around the focus,
   * "scan": a slow scan line that densifies the field as it passes.
   */
  variant?: AsciiVariant;
  /** Cells per CSS px, relative. 1 is an 8 × 16 px cell; 0.75 is sparser. */
  density?: number;
  /** Reach of the pointer, CSS px. */
  radius?: number;
  /** Varies topo, ramp, halo, rain and scan between instances. */
  seed?: number;
  /** Focal point as fractions [x, y]: the halo centre or the ramp corner. */
  focus?: readonly [number, number];
}

const DEFAULT_FOCUS: Partial<Record<AsciiVariant, readonly [number, number]>> =
  { ramp: [1, 0], halo: [0.5, 0.45] };

const PATTERNS: Partial<
  Record<AsciiVariant, (options: PatternOptions) => AsciiSpec>
> = {
  topo: topoSpec,
  ramp: rampSpec,
  rain: rainSpec,
  halo: haloSpec,
  scan: scanSpec,
};

// One glyph table for every variant: index 0 blank, then the ramp, then blocks.
const CHARS = `${RAMP}${BLOCKS.slice(1)}`;
const RAMP_LAST = RAMP.length - 1;
const HALF_TOP = RAMP.length; // ▀
const HALF_BOTTOM = RAMP.length + 1; // ▄
const FULL = RAMP.length + 2; // █

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

function makeSpec(
  variant: AsciiVariant,
  density: number,
  radius: number,
  seed = 0,
  focus?: readonly [number, number],
): AsciiSpec {
  const cellW = Math.max(5, Math.round(8 / Math.max(density, 0.25)));
  const cellH = cellW * 2;
  const scramble = [2, 3, 4, 5, 6, 7];

  const pattern = PATTERNS[variant];
  if (pattern) {
    return pattern({
      cellW,
      cellH,
      radius,
      seed,
      focus: focus ?? DEFAULT_FOCUS[variant] ?? [0.5, 0.5],
    });
  }

  if (variant === "qr") {
    // Each cell is one module wide and two tall (half blocks keep them square).
    const tileAlpha = (c: number, r: number) => {
      const n = valueNoise(c / TILE / 1.3 + 0.3, (r * 2) / TILE / 1.3 + 0.7);
      return 0.045 + 0.075 * smoothstep(clamp01((n - 0.25) / 0.6));
    };
    return {
      chars: CHARS,
      cellW,
      cellH,
      radius,
      scramble,
      base(c, r, _cols, _rows, out: Cell) {
        const top = qrModule(c, r * 2);
        const bottom = qrModule(c, r * 2 + 1);
        out.g =
          top && bottom ? FULL : top ? HALF_TOP : bottom ? HALF_BOTTOM : 0;
        out.a = tileAlpha(c, r);
      },
      hot(_c, _r, t, wave, out) {
        if (t < 0.12) {
          out.a += 0.2 * t;
          return;
        }
        // Inside the lens the modules "decode" into the ASCII ramp.
        const on = out.g > 0;
        const level = on ? 4 + Math.round(wave * 5) : Math.round(wave * 3);
        out.g = Math.min(RAMP_LAST, level);
        out.a = out.a + (0.42 - out.a) * t * (0.55 + 0.45 * wave);
      },
    };
  }

  const field =
    variant === "wave"
      ? (c: number, r: number) => {
          const x = c * 0.075;
          const y = r * 0.15;
          const v =
            0.5 + 0.5 * Math.sin(x * 1.3 + 2.4 * Math.sin(y * 0.55 + x * 0.18));
          // Contour bands: bright near the crest, empty in the troughs.
          return smoothstep(clamp01((v - 0.42) / 0.58)) ** 1.4;
        }
      : (c: number, r: number) => {
          const n =
            valueNoise(c * 0.055, r * 0.11) * 0.7 +
            valueNoise(c * 0.16 + 9, r * 0.32 + 4) * 0.3;
          return smoothstep(clamp01((n - 0.38) / 0.5));
        };

  return {
    chars: CHARS,
    cellW,
    cellH,
    radius,
    scramble,
    base(c, r, _cols, _rows, out) {
      const v = field(c, r);
      out.g = Math.round(v * (RAMP_LAST - 1));
      out.a = 0.05 + 0.11 * v;
    },
    hot(_c, _r, t, wave, out) {
      out.g = Math.min(RAMP_LAST, out.g + Math.round(t * (1.5 + 3.5 * wave)));
      if (out.g === 0 && t > 0.3) out.g = 1;
      out.a = out.a + (0.45 - out.a) * t * (0.5 + 0.5 * wave);
    },
  };
}

/**
 * Low-contrast monospace pattern that fills its (relative) parent. Near the
 * pointer the characters ripple and brighten; on first view it decodes in
 * once. Rain and scan also move slowly on their own while on screen. Static
 * with reduced motion; pointer effects are off on touch.
 */
export function AsciiField({
  className,
  variant = "noise",
  density = 1,
  radius = 150,
  seed = 0,
  focus,
}: AsciiFieldProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const fx = focus?.[0];
  const fy = focus?.[1];

  useEffect(() => {
    const canvas = ref.current;
    const parent = canvas?.parentElement;
    // Inside a <Backdrop> layer (pointer-events: none) listen on its section.
    const host = parent?.hasAttribute("data-backdrop")
      ? parent.parentElement
      : parent;
    if (!canvas || !host) return;
    const at = fx === undefined || fy === undefined ? undefined : [fx, fy];
    return mountAscii(
      canvas,
      host,
      makeSpec(
        variant,
        density,
        radius,
        seed,
        at as readonly [number, number] | undefined,
      ),
    );
  }, [variant, density, radius, seed, fx, fy]);

  return (
    // biome-ignore lint/a11y/noAriaHiddenOnFocusable: a canvas without tabIndex is not focusable; it is decorative
    <canvas
      ref={ref}
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 size-full select-none text-foreground [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_78%)]",
        className,
      )}
    />
  );
}
