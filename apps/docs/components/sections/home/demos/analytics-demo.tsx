"use client";

import { motion, useInView, useReducedMotion } from "motion/react";
import { useRef, useState } from "react";
import { DURATION, EASE } from "@/components/mockups/motion";
import { SegmentedControl } from "@/components/mockups/segmented-control";

// Illustrative numbers; the dashboard charts a code's real scans.
const DATA = {
  week: {
    labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    values: [42, 58, 51, 77, 96, 128, 84],
  },
  month: {
    labels: ["Wk 1", "Wk 2", "Wk 3", "Wk 4"],
    values: [310, 402, 468, 536],
  },
} as const;

const DEVICES = [
  { label: "Mobile", share: 86, className: "bg-[#155dfc]" },
  { label: "Tablet", share: 9, className: "bg-[#155dfc]/60" },
  { label: "Desktop", share: 5, className: "bg-[#155dfc]/30" },
];

type Range = keyof typeof DATA;

const RANGES = [
  { value: "week", label: "7 days" },
  { value: "month", label: "30 days" },
] as const;

/** Animated scans-over-time and device split, with example data. */
export function AnalyticsDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const reduce = useReducedMotion();
  const [range, setRange] = useState<Range>("week");
  const { labels, values } = DATA[range];
  const max = Math.max(...values);
  const total = values.reduce((sum, value) => sum + value, 0);
  const show = inView || reduce;

  return (
    <div ref={ref} className="flex h-full flex-col justify-center gap-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-2xl font-semibold tabular-nums tracking-tight">
            {total.toLocaleString("en-US")}
          </p>
          <p className="text-xs text-muted-foreground">Scans (example data)</p>
        </div>
        <SegmentedControl
          label="Date range"
          options={RANGES}
          value={range}
          onChange={setRange}
          size="sm"
        />
      </div>
      <div
        role="img"
        aria-label={`Bar chart of example scans: ${labels
          .map((label, i) => `${label} ${values[i]}`)
          .join(", ")}`}
        className="flex h-28 items-end gap-1.5"
      >
        {values.map((value, i) => (
          <div
            key={`${range}-${labels[i]}`}
            className="flex h-full flex-1 flex-col gap-1"
          >
            <div className="flex flex-1 items-end">
              <motion.div
                className="w-full rounded-t-[4px] bg-[#155dfc]"
                initial={reduce ? false : { height: "0%" }}
                animate={{ height: show ? `${(value / max) * 100}%` : "0%" }}
                transition={{
                  duration: DURATION.slow + 0.1,
                  ease: EASE,
                  delay: reduce ? 0 : i * 0.03,
                }}
              />
            </div>
            <span className="text-center text-[10px] text-muted-foreground">
              {labels[i]}
            </span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex h-2 overflow-hidden rounded-full bg-muted">
          {DEVICES.map((device) => (
            <span
              key={device.label}
              className={device.className}
              style={{ width: `${device.share}%` }}
            />
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {DEVICES.map((device) => `${device.label} ${device.share}%`).join(
            " · ",
          )}
        </p>
      </div>
    </div>
  );
}
