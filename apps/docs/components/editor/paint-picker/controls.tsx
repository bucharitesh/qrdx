"use client";

import { cn } from "@repo/design-system/lib/utils";
import { type KeyboardEvent, type PointerEvent, useRef } from "react";
import {
  clamp,
  type HSBA,
  hsbToRgb,
  round,
  toHex,
} from "@/lib/paint/color-math";

/** Checkerboard behind see-through colors (neutral grays, both themes). */
export const CHECKER_STYLE = {
  backgroundImage:
    "conic-gradient(#d4d4d8 25%, #fafafa 0 50%, #d4d4d8 0 75%, #fafafa 0)",
  backgroundSize: "8px 8px",
} as const;

/** Arrow-key step: 1, or 10 with Shift. */
function stepOf(event: KeyboardEvent) {
  return event.shiftKey ? 10 : 1;
}

/** Fraction 0–1 of a pointer across an element. */
function fraction(event: PointerEvent<HTMLElement>, element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return {
    x: clamp((event.clientX - rect.left) / Math.max(rect.width, 1), 0, 1),
    y: clamp((event.clientY - rect.top) / Math.max(rect.height, 1), 0, 1),
  };
}

/**
 * The saturation (across) and brightness (down) square for the current hue.
 * Drag or click it; arrow keys move 1% (10% with Shift), left and right for
 * saturation, up and down for brightness.
 */
export function ColorArea({
  color,
  onChange,
}: {
  color: HSBA;
  onChange: (color: HSBA) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Key repeats can land before the next render: step from the latest value
  const latest = useRef(color);
  latest.current = color;
  const hue = toHex(hsbToRgb({ h: color.h, s: 100, b: 100, a: 1 }));
  const send = (next: HSBA) => {
    latest.current = next;
    onChange(next);
  };

  const update = (event: PointerEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    const { x, y } = fraction(event, ref.current);
    send({ ...latest.current, s: x * 100, b: (1 - y) * 100 });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = stepOf(event);
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    const base = latest.current;
    send({
      ...base,
      s: clamp(base.s + move[0], 0, 100),
      b: clamp(base.b + move[1], 0, 100),
    });
  };

  return (
    <div
      aria-label="Saturation and brightness"
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={round(color.s)}
      aria-valuetext={`Saturation ${round(color.s)}%, brightness ${round(color.b)}%`}
      className="focus-visible:ring-ring/50 relative h-36 w-full cursor-crosshair touch-none rounded-md outline-none focus-visible:ring-[3px]"
      onKeyDown={onKeyDown}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.focus();
        update(event);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          update(event);
        }
      }}
      ref={ref}
      role="slider"
      style={{
        backgroundColor: hue,
        backgroundImage:
          "linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)",
      }}
      tabIndex={0}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.35),0_1px_3px_rgb(0_0_0/0.3)]"
        style={{
          left: `${color.s}%`,
          top: `${100 - color.b}%`,
          backgroundColor: toHex(hsbToRgb({ ...color, a: 1 })),
        }}
      />
    </div>
  );
}

/**
 * A horizontal channel slider (hue, opacity): drag, click, or arrow keys
 * (1, 10 with Shift; Home and End jump to the ends).
 */
export function ChannelSlider({
  label,
  value,
  max,
  onChange,
  background,
  checker,
  thumbColor,
  valueText,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
  /** CSS background of the track */
  background: string;
  /** Show a checkerboard under the track (opacity) */
  checker?: boolean;
  thumbColor: string;
  valueText: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Key repeats can land before the next render: step from the latest value
  const latest = useRef(value);
  latest.current = value;

  const update = (event: PointerEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    latest.current = fraction(event, ref.current).x * max;
    onChange(latest.current);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = stepOf(event);
    const current = latest.current;
    let next: number | null = null;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      next = current - step;
    } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      next = current + step;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = max;
    }
    if (next === null) return;
    event.preventDefault();
    latest.current = clamp(next, 0, max);
    onChange(latest.current);
  };

  return (
    <div
      aria-label={label}
      aria-valuemax={max}
      aria-valuemin={0}
      aria-valuenow={round(value)}
      aria-valuetext={valueText}
      className={cn(
        "focus-visible:ring-ring/50 relative h-3 w-full cursor-pointer touch-none rounded-full outline-none focus-visible:ring-[3px]",
      )}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.focus();
        update(event);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          update(event);
        }
      }}
      ref={ref}
      role="slider"
      style={checker ? CHECKER_STYLE : undefined}
      tabIndex={0}
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.08)]"
        style={{ background }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.35),0_1px_3px_rgb(0_0_0/0.3)]"
        style={{
          left: `${(clamp(value, 0, max) / max) * 100}%`,
          backgroundColor: thumbColor,
        }}
      />
    </div>
  );
}

export const HUE_TRACK =
  "linear-gradient(to right, #f00 0%, #ff0 16.67%, #0f0 33.33%, #0ff 50%, #00f 66.67%, #f0f 83.33%, #f00 100%)";

/** A color as a round swatch, with a checkerboard under see-through ones. */
export function SwatchDot({
  background,
  className,
}: {
  background: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative block shrink-0 overflow-hidden rounded-full",
        className,
      )}
      style={CHECKER_STYLE}
    >
      <span
        className="absolute inset-0 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)] dark:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.14)]"
        style={{ background }}
      />
    </span>
  );
}
