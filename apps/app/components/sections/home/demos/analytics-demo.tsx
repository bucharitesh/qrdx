"use client";

import { motion, useInView, useReducedMotion } from "motion/react";
import { type PointerEvent, useMemo, useRef, useState } from "react";
import { EASE } from "@/components/mockups/motion";
import { SegmentedControl } from "@/components/mockups/segmented-control";
import { ControlBar, ExampleTag, Readout } from "./demo-ui";

// Illustrative numbers; the dashboard charts a code's real scans.
const WEEK = [42, 58, 51, 77, 96, 128, 84];
// A gentle weekly rhythm on a slow rise, so 30 days reads as calmly as 7.
const MONTH = Array.from({ length: 30 }, (_, i) =>
  Math.round(
    52 + i * 1.6 + 16 * Math.sin(i * 0.9 - 0.6) + 6 * Math.sin(i * 0.31),
  ),
);
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DATA = {
  week: {
    values: WEEK,
    span: "7 days",
    label: (i: number) => WEEKDAYS[i] ?? "",
  },
  month: {
    values: MONTH,
    span: "30 days",
    label: (i: number) => `Day ${i + 1}`,
  },
} as const;

type Range = keyof typeof DATA;
const RANGES = [
  { value: "week", label: "7 days" },
  { value: "month", label: "30 days" },
] as const;

const W = 320;
const H = 104;
const PAD = 6;

function toPath(values: readonly number[]) {
  const max = Math.max(...values) * 1.1;
  const step = (W - PAD * 2) / Math.max(values.length - 1, 1);
  const pts = values.map(
    (v, i) => [PAD + i * step, H - PAD - (v / max) * (H - PAD * 2)] as const,
  );
  // Smooth line through the points (cardinal-like, tension 0.18).
  let line = `M${pts[0]?.[0]} ${pts[0]?.[1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1] ?? [0, 0];
    const [x1, y1] = pts[i] ?? [0, 0];
    const [xp, yp] = pts[i - 2] ?? [x0, y0];
    const [xn, yn] = pts[i + 1] ?? [x1, y1];
    const t = 0.18;
    line += ` C${x0 + (x1 - xp) * t} ${y0 + (y1 - yp) * t} ${x1 - (xn - x0) * t} ${y1 - (yn - y0) * t} ${x1} ${y1}`;
  }
  const area = `${line} L${pts.at(-1)?.[0]} ${H} L${pts[0]?.[0]} ${H} Z`;
  return { line, area, pts };
}

/** Scans over time with a hover read-out, with example data. */
export function AnalyticsDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const reduce = useReducedMotion();
  const [range, setRange] = useState<Range>("week");
  const [hover, setHover] = useState<number | null>(null);
  const { values, label, span } = DATA[range];
  const { line, area, pts } = useMemo(() => toPath(values), [values]);
  const total = values.reduce((sum, value) => sum + value, 0);
  const show = inView || reduce;
  const active = hover !== null ? pts[hover] : null;
  const hovered = hover !== null ? values[hover] : undefined;

  const onMove = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * W;
    const step = (W - PAD * 2) / Math.max(values.length - 1, 1);
    setHover(
      Math.max(0, Math.min(values.length - 1, Math.round((x - PAD) / step))),
    );
  };

  return (
    <div ref={ref} className="flex h-full flex-col">
      <div className="relative flex min-h-0 flex-1 flex-col justify-center gap-4 px-5 sm:px-6">
        <ExampleTag />
        <div className="flex flex-col gap-0.5">
          <p className="text-3xl font-semibold tabular-nums tracking-tight">
            {(hovered ?? total).toLocaleString("en-US")}
          </p>
          <Readout>
            {hover !== null
              ? `scans on ${label(hover)}`
              : `scans, last ${span}`}
          </Readout>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="relative h-24 sm:h-28">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              className="absolute inset-0 size-full touch-none overflow-visible"
              role="img"
              aria-label={`Line chart of example scans over the last ${span}, ${total} in total`}
              onPointerMove={onMove}
              onPointerLeave={() => setHover(null)}
            >
              <defs>
                <linearGradient id="an-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0"
                    stopColor="currentColor"
                    stopOpacity="0.12"
                  />
                  <stop offset="1" stopColor="currentColor" stopOpacity="0" />
                </linearGradient>
                {/* The line draws in left to right by revealing it, which keeps
                    its stroke crisp under the non-uniform scale. */}
                <clipPath id="an-reveal">
                  <motion.rect
                    key={`r-${range}`}
                    x={0}
                    y={-10}
                    height={H + 20}
                    initial={reduce ? false : { width: 0 }}
                    animate={{ width: show ? W : 0 }}
                    transition={{ duration: 0.9, ease: EASE }}
                  />
                </clipPath>
              </defs>
              {[0.25, 0.5, 0.75].map((f) => (
                <line
                  key={f}
                  x1={0}
                  x2={W}
                  y1={H * f}
                  y2={H * f}
                  className="stroke-foreground/[0.07]"
                  strokeDasharray="2 4"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              <g className="text-foreground" clipPath="url(#an-reveal)">
                <motion.path
                  key={`a-${range}`}
                  d={area}
                  fill="url(#an-fill)"
                  initial={reduce ? false : { opacity: 0 }}
                  animate={{ opacity: show ? 1 : 0 }}
                  transition={{
                    duration: 0.6,
                    delay: reduce ? 0 : 0.35,
                    ease: EASE,
                  }}
                />
                <path
                  d={line}
                  fill="none"
                  stroke="currentColor"
                  strokeOpacity={0.85}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
              {active && (
                <line
                  x1={active[0]}
                  x2={active[0]}
                  y1={0}
                  y2={H}
                  className="stroke-foreground/25"
                  strokeDasharray="2 3"
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </svg>
            {active && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-foreground bg-background"
                style={{
                  left: `${(active[0] / W) * 100}%`,
                  top: `${(active[1] / H) * 100}%`,
                }}
              />
            )}
          </div>
          <div
            aria-hidden="true"
            className="flex justify-between font-mono text-[10px] text-muted-foreground"
          >
            <span>{label(0)}</span>
            <span>{label(values.length - 1)}</span>
          </div>
        </div>
      </div>
      <ControlBar className="justify-between">
        <Readout>range</Readout>
        <SegmentedControl
          label="Date range"
          options={RANGES}
          value={range}
          onChange={(next) => {
            setHover(null);
            setRange(next);
          }}
          size="sm"
        />
      </ControlBar>
    </div>
  );
}
