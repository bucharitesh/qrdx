"use client";

import { cn } from "@repo/design-system/lib/utils";
import { useEffect, useRef } from "react";
import { type AsciiSpec, mountAscii } from "./ascii";
import { RAMP } from "./glyphs";
import { QRDX_QR_H } from "./qr-matrix";

interface AsciiQrProps {
  className?: string;
  /** Rows of "0"/"1" (default: https://qrdx.dev, error correction H). */
  code?: readonly string[];
  /** Cells to blank in the middle for a label: [columns, rows]. */
  knockout?: [number, number];
  /** Cell size, CSS px. The canvas is (size + 4) cells square. */
  cell?: number;
}

const CHARS = `${RAMP}█`;
const FULL = RAMP.length;
const DOT = RAMP.indexOf(".");
const LAST = RAMP.length - 1;
const QUIET = 2;

/**
 * A real QR code drawn in monospace glyphs: dark modules are solid blocks,
 * light ones faint dots. Near the pointer the modules "decode" into the ASCII
 * ramp and settle back, so at rest it scans. Static on touch and with reduced
 * motion. The canvas sizes itself: (modules + 4) × cell CSS px square.
 */
export function AsciiQr({
  className,
  code = QRDX_QR_H,
  knockout,
  cell = 10,
}: AsciiQrProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [kw, kh] = knockout ?? [0, 0];
  const size = (code.length + QUIET * 2) * cell;

  useEffect(() => {
    const canvas = ref.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;
    const n = code.length;
    const span = n + QUIET * 2;
    const k0x = Math.floor((n - kw) / 2);
    const k0y = Math.floor((n - kh) / 2);
    const blank = (x: number, y: number) =>
      x >= k0x && x < k0x + kw && y >= k0y && y < k0y + kh;
    const dark = (c: number, r: number) => {
      const x = c - QUIET;
      const y = r - QUIET;
      if (x < 0 || y < 0 || x >= n || y >= n || blank(x, y)) return null;
      return code[y]?.[x] === "1";
    };
    const spec: AsciiSpec = {
      chars: CHARS,
      cellW: cell,
      cellH: cell,
      radius: cell * 9,
      scramble: [3, 5, 6, 7, 8, 9],
      grid: () => ({ cols: span, rows: span }),
      base(c, r, _cols, _rows, out) {
        const d = dark(c, r);
        if (d) {
          out.g = FULL;
          out.a = 0.92;
        } else if (d === false) {
          out.g = DOT;
          out.a = 0.16;
        }
      },
      hot(c, r, t, wave, out) {
        const d = dark(c, r);
        if (d === null || t < 0.15) return;
        out.g = d
          ? Math.max(5, LAST - Math.round(wave * 3))
          : Math.min(4, 1 + Math.round(wave * 3));
        out.a = d ? 0.92 - 0.3 * t * wave : 0.16 + 0.3 * t * wave;
      },
    };
    return mountAscii(canvas, host, spec);
  }, [code, kw, kh, cell]);

  return (
    // biome-ignore lint/a11y/noAriaHiddenOnFocusable: a canvas without tabIndex is not focusable; it is decorative
    <canvas
      ref={ref}
      aria-hidden="true"
      className={cn("block select-none text-neutral-950", className)}
      style={{ width: size, height: size }}
    />
  );
}
