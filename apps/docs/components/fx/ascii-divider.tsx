"use client";

import { cn } from "@repo/design-system/lib/utils";
import { useEffect, useRef } from "react";
import { type AsciiSpec, mountAscii } from "./ascii";
import { RAMP } from "./glyphs";

interface AsciiDividerProps {
  className?: string;
}

const DASH = RAMP.indexOf("-");
const PLUS = RAMP.indexOf("+");
const TICK = 24;
const LAST = RAMP.length - 1;

const spec: AsciiSpec = {
  chars: RAMP,
  cellW: 8,
  cellH: 16,
  radius: 170,
  scramble: [3, 4, 5, 6, 7, 8],
  grid: (w) => ({ cols: Math.ceil(w / 8), rows: 1 }),
  base(c, _r, cols, _rows, out) {
    // A dashed rule with "+" ticks, centred on the middle tick.
    const k = c - Math.floor(cols / 2);
    const tick = ((k % TICK) + TICK) % TICK === 0;
    out.g = tick ? PLUS : DASH;
    out.a = tick ? 0.32 : 0.13;
  },
  hot(_c, _r, t, wave, out) {
    out.g = Math.min(LAST, out.g + Math.round(t * (1 + 3 * wave)));
    out.a = out.a + (0.6 - out.a) * t * (0.45 + 0.55 * wave);
  },
};

/**
 * Thin animated ASCII rule for between sections: it decodes in on first view
 * and ripples where the pointer passes over it. Static on touch and with
 * reduced motion. Fixed height, so it never shifts the layout.
 */
export function AsciiDivider({ className }: AsciiDividerProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;
    return mountAscii(canvas, host, spec);
  }, []);

  return (
    <div
      aria-hidden="true"
      className={cn("relative h-10 w-full select-none", className)}
    >
      <canvas
        ref={ref}
        className="pointer-events-none absolute inset-0 size-full text-foreground [mask-image:linear-gradient(to_right,transparent,black_18%,black_82%,transparent)]"
      />
    </div>
  );
}
