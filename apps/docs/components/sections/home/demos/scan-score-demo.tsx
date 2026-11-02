"use client";

import { cn } from "@repo/design-system/lib/utils";
import { motion, useInView, useReducedMotion } from "motion/react";
import { getScanScore, QRCodeSVG, type ScanScoreResult } from "qrdx";
import { useEffect, useMemo, useRef, useState } from "react";
import { GRADE_COLORS, GRADE_LABELS } from "@/components/editor/scan-score";
import { EASE } from "@/components/mockups/motion";
import { SegmentedControl } from "@/components/mockups/segmented-control";
import { HOME_CODES } from "./codes";
import { ControlBar, QrTile, Readout } from "./demo-ui";
import { scanRows } from "./scan-rows";

const INKS = {
  black: { label: "Black", color: "#0b0b0d" },
  graphite: { label: "Graphite", color: "#52525b" },
  gray: { label: "Gray", color: "#a1a1aa" },
  pale: { label: "Pale", color: "#d4d4d8" },
} as const;
type InkKey = keyof typeof INKS;
const INK_OPTIONS = (Object.keys(INKS) as InkKey[]).map((value) => ({
  value,
  label: INKS[value].label,
}));

const R = 26;
const CIRC = 2 * Math.PI * R;

/** Lighten the ink and watch the real scan score (decoded in your browser) react. */
export function ScanScoreDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const reduce = useReducedMotion();
  const [ink, setInk] = useState<InkKey>("black");
  const [result, setResult] = useState<ScanScoreResult | null>(null);
  const [checking, setChecking] = useState(true);
  // Scoring needs canvas and image decoding; if the browser can't, say so
  // instead of showing "Checking" forever.
  const [failed, setFailed] = useState(false);
  const fg = INKS[ink].color;
  // Only the ink changes; the logo stays as printed.
  const props = useMemo(
    () => ({
      ...HOME_CODES.scanScore,
      fgColor: fg,
      eyeColor: fg,
      dotColor: fg,
    }),
    [fg],
  );

  useEffect(() => {
    if (!inView) return;
    const controller = new AbortController();
    setChecking(true);
    const timer = window.setTimeout(() => {
      getScanScore(props, { signal: controller.signal })
        .then((score) => {
          setResult(score);
          setFailed(false);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          console.error("Home scan score demo failed", error);
          setResult(null);
          setFailed(true);
        })
        .finally(() => {
          if (!controller.signal.aborted) setChecking(false);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [props, inView]);

  const score = result?.score ?? 0;
  const rows = scanRows(result);

  return (
    <div ref={ref} className="flex h-full flex-col">
      {/* Fixed widths and four fixed rows: switching ink or waiting for the
          score never moves the code or the card. */}
      <div className="flex min-h-0 flex-1 items-center justify-center gap-4 px-4 sm:gap-10 sm:px-6">
        <div className="relative w-[5.5rem] shrink-0 sm:w-36">
          <QrTile
            label={`QR code with the QRdx logo, in ${INKS[ink].label.toLowerCase()} ink on white`}
            className="w-full p-0 transition-colors"
          >
            <QRCodeSVG {...props} />
          </QrTile>
          {checking && !reduce && (
            <motion.span
              aria-hidden="true"
              initial={{ top: "8%", opacity: 0 }}
              animate={{ top: ["8%", "90%"], opacity: 1 }}
              transition={{
                top: {
                  duration: 1,
                  ease: "easeInOut",
                  repeat: Number.POSITIVE_INFINITY,
                  repeatType: "reverse",
                },
                opacity: { duration: 0.2 },
              }}
              className="pointer-events-none absolute inset-x-2 h-0.5 rounded-full bg-primary"
            />
          )}
        </div>
        <div className="flex min-w-0 max-w-48 flex-1 flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="relative size-14 shrink-0 sm:size-16">
              <svg
                viewBox="0 0 64 64"
                className="size-full -rotate-90"
                aria-hidden="true"
              >
                <circle
                  cx="32"
                  cy="32"
                  r={R}
                  className="fill-none stroke-foreground/10"
                  strokeWidth="4"
                />
                <motion.circle
                  cx="32"
                  cy="32"
                  r={R}
                  strokeWidth="4"
                  strokeLinecap="round"
                  className="fill-none stroke-foreground"
                  strokeDasharray={CIRC}
                  initial={false}
                  animate={{ strokeDashoffset: CIRC * (1 - score / 100) }}
                  transition={{ duration: reduce ? 0 : 0.7, ease: EASE }}
                />
              </svg>
              <span
                className="absolute inset-0 grid place-items-center text-base font-semibold tabular-nums sm:text-lg"
                aria-live="polite"
              >
                {result ? score : failed ? "–" : "…"}
              </span>
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-1.5 shrink-0 rounded-full transition-colors",
                    result ? GRADE_COLORS[result.grade] : "bg-foreground/20",
                  )}
                />
                {result
                  ? GRADE_LABELS[result.grade]
                  : failed
                    ? "Couldn't check"
                    : "Checking"}
              </span>
              <Readout>scan score</Readout>
            </div>
          </div>
          <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 gap-y-1.5 text-[11px] sm:text-xs">
            {rows.map((row) => (
              <div key={row.id} className="contents">
                <dt className="whitespace-nowrap text-muted-foreground">
                  {row.label}
                </dt>
                <dd
                  className={cn(
                    "whitespace-nowrap text-right font-medium tabular-nums",
                    row.passed === false && "text-red-600 dark:text-red-400",
                  )}
                >
                  {row.value ??
                    (failed ? (
                      "–"
                    ) : (
                      <span
                        aria-hidden="true"
                        className="inline-block h-2 w-10 rounded-full bg-foreground/10 motion-safe:animate-pulse"
                      />
                    ))}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      <ControlBar className="justify-center sm:justify-between">
        {/* On phones the four ink names need the whole strip. */}
        <Readout className="hidden sm:inline">ink</Readout>
        <SegmentedControl
          label="Ink color"
          options={INK_OPTIONS}
          value={ink}
          onChange={setInk}
          size="sm"
        />
      </ControlBar>
    </div>
  );
}
