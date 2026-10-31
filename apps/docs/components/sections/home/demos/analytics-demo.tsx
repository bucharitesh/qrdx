"use client";

import { cn } from "@repo/design-system/lib/utils";
import { motion, useInView, useReducedMotion } from "motion/react";
import { type PointerEvent, useMemo, useRef, useState } from "react";
import { EASE } from "@/components/mockups/motion";
import { SegmentedControl } from "@/components/mockups/segmented-control";
import { DemoStage, Readout } from "./demo-ui";

// Illustrative numbers; the dashboard charts a code's real scans.
const WEEK = [42, 58, 51, 77, 96, 128, 84];
const MONTH = Array.from({ length: 30 }, (_, i) =>
  Math.round(
    48 +
      i * 2.1 +
      22 * Math.sin(i * 0.9) +
      14 * Math.sin(i * 2.3 + 1) +
      (i % 7 === 5 ? 30 : 0),
  ),
);
const DATA = {
  week: {
    values: WEEK,
    label: (i: number) =>
      ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i] ?? "",
  },
  month: { values: MONTH, label: (i: number) => `Day ${i + 1}` },
} as const;

const DEVICES = [
  { label: "Mobile", share: 86, className: "bg-foreground/80" },
  { label: "Tablet", share: 9, className: "bg-foreground/40" },
  { label: "Desktop", share: 5, className: "bg-foreground/15" },
];

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

/** Scans over time with a hover read-out, and the device split, with example data. */
export function AnalyticsDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const reduce = useReducedMotion();
  const [range, setRange] = useState<Range>("week");
  const [hover, setHover] = useState<number | null>(null);
  const { values, label } = DATA[range];
  const { line, area, pts } = useMemo(() => toPath(values), [values]);
  const total = values.reduce((sum, value) => sum + value, 0);
  const show = inView || reduce;
  const active = hover !== null ? pts[hover] : null;

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
      <DemoStage
        pattern="halo"
        className="flex flex-1 flex-col justify-center gap-3 px-5 py-4"
      >
        <div className="flex items-end justify-between gap-3">
          <div className="flex gap-6">
            <div>
              <p className="text-2xl font-semibold tabular-nums tracking-tight">
                {total.toLocaleString("en-US")}
              </p>
              <Readout>scans</Readout>
            </div>
            <div className="hidden sm:block">
              <p className="text-2xl font-semibold tabular-nums tracking-tight">
                {Math.round(total * 0.78).toLocaleString("en-US")}
              </p>
              <Readout>unique</Readout>
            </div>
          </div>
          <Readout className="pb-1">
            {active && hover !== null
              ? `${label(hover)} · ${values[hover]}`
              : "example data"}
          </Readout>
        </div>
        <div className="relative h-24">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="absolute inset-0 size-full touch-none overflow-visible"
            role="img"
            aria-label={`Line chart of example scans over ${range === "week" ? "7" : "30"} days, ${total} in total`}
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          >
            <defs>
              <linearGradient id="an-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="currentColor" stopOpacity="0.14" />
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
              <g className="text-foreground">
                <line
                  x1={active[0]}
                  x2={active[0]}
                  y1={0}
                  y2={H}
                  className="stroke-foreground/25"
                  strokeDasharray="2 3"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
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
        <div className="flex flex-col gap-1.5">
          <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full">
            {DEVICES.map((device, i) => (
              <motion.span
                key={device.label}
                className={cn("h-full rounded-full", device.className)}
                initial={reduce ? false : { width: "0%" }}
                animate={{ width: show ? `${device.share}%` : "0%" }}
                transition={{
                  duration: 0.7,
                  delay: reduce ? 0 : 0.4 + i * 0.08,
                  ease: EASE,
                }}
              />
            ))}
          </div>
          <div className="flex gap-3">
            {DEVICES.map((device) => (
              <span
                key={device.label}
                className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
              >
                <span
                  className={cn("size-1.5 rounded-full", device.className)}
                />
                {device.label} {device.share}%
              </span>
            ))}
          </div>
        </div>
      </DemoStage>
      <div className="flex items-center justify-between gap-3 border-t px-4 py-3">
        <Readout>range</Readout>
        <SegmentedControl
          label="Date range"
          options={RANGES}
          value={range}
          onChange={setRange}
          size="sm"
        />
      </div>
    </div>
  );
}
