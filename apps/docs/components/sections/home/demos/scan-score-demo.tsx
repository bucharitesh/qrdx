"use client";

import { Close, Tick } from "@repo/design-system/components/icons";
import { cn } from "@repo/design-system/lib/utils";
import { motion, useInView, useReducedMotion } from "motion/react";
import { getQRData, getScanScore, QRCode, type ScanScoreResult } from "qrdx";
import { useEffect, useRef, useState } from "react";
import { GRADE_LABELS } from "@/components/editor/scan-score";
import { EASE } from "@/components/mockups/motion";
import { SegmentedControl } from "@/components/mockups/segmented-control";
import { easterEggUrl } from "@/lib/easter-eggs";
import { DemoStage, QrTile, Readout } from "./demo-ui";
import { FAMILY } from "./qr-family";

const VALUE = easterEggUrl("score");
/** Quiet zone in modules, drawn into the code so the score counts it. */
const MARGIN = 2;

const INKS = {
  ink: { label: "Ink", color: "#0b0b0d" },
  graphite: { label: "Graphite", color: "#52525b" },
  gray: { label: "Gray", color: "#a1a1aa" },
  pale: { label: "Pale", color: "#d4d4d8" },
} as const;
type InkKey = keyof typeof INKS;
const INK_OPTIONS = (Object.keys(INKS) as InkKey[]).map((value) => ({
  value,
  label: INKS[value].label,
}));

const RING = {
  great: "stroke-emerald-500",
  ok: "stroke-amber-400",
  risky: "stroke-orange-500",
  fails: "stroke-red-500",
} as const;

const R = 30;
const CIRC = 2 * Math.PI * R;

/** Lighten the ink and watch the real scan score (decoded in your browser) react. */
export function ScanScoreDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const reduce = useReducedMotion();
  const [ink, setInk] = useState<InkKey>("ink");
  const [result, setResult] = useState<ScanScoreResult | null>(null);
  const [checking, setChecking] = useState(true);
  const fg = INKS[ink].color;

  useEffect(() => {
    if (!inView) return;
    const controller = new AbortController();
    setChecking(true);
    const timer = window.setTimeout(() => {
      getScanScore(
        {
          ...getQRData({
            value: VALUE,
            bgColor: FAMILY.bgColor,
            fgColor: fg,
            eyeColor: fg,
            dotColor: fg,
            bodyPattern: FAMILY.bodyPattern,
            hideLogo: true,
          }),
          level: "Q",
          margin: MARGIN,
          cornerEyePattern: FAMILY.cornerEyePattern,
          cornerEyeDotPattern: FAMILY.cornerEyeDotPattern,
        },
        { signal: controller.signal },
      )
        .then((score) => setResult(score))
        .catch(() => undefined)
        .finally(() => {
          if (!controller.signal.aborted) setChecking(false);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [fg, inView]);

  const score = result?.score ?? 0;
  const checks = result
    ? [...result.checks]
        .sort((a, b) => Number(a.passed) - Number(b.passed))
        .slice(0, 3)
    : [];

  return (
    <div ref={ref} className="flex h-full flex-col">
      <DemoStage
        pattern="scan"
        className="flex flex-1 items-center justify-center gap-4 px-4 sm:gap-8 sm:px-5"
      >
        <div className="relative w-24 shrink-0 sm:w-36">
          <QrTile
            label={`QR code in ${INKS[ink].label.toLowerCase()} ink on white`}
            className="w-full p-0 transition-colors"
          >
            <QRCode
              value={VALUE}
              size={144}
              level="Q"
              margin={MARGIN}
              hideLogo
              bgColor={FAMILY.bgColor}
              fgColor={fg}
              eyeColor={fg}
              dotColor={fg}
              bodyPattern={FAMILY.bodyPattern}
              cornerEyePattern={FAMILY.cornerEyePattern}
              cornerEyeDotPattern={FAMILY.cornerEyeDotPattern}
            />
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
              className="pointer-events-none absolute inset-x-2 h-0.5 rounded-full bg-[#155dfc] shadow-[0_0_14px_3px_rgba(21,93,252,0.45)]"
            />
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="relative size-[72px] shrink-0">
              <svg
                viewBox="0 0 72 72"
                className="size-full -rotate-90"
                aria-hidden="true"
              >
                <circle
                  cx="36"
                  cy="36"
                  r={R}
                  className="fill-none stroke-foreground/10"
                  strokeWidth="5"
                />
                <motion.circle
                  cx="36"
                  cy="36"
                  r={R}
                  strokeWidth="5"
                  strokeLinecap="round"
                  className={cn(
                    "fill-none transition-colors duration-300",
                    result ? RING[result.grade] : "stroke-foreground/30",
                  )}
                  strokeDasharray={CIRC}
                  initial={false}
                  animate={{ strokeDashoffset: CIRC * (1 - score / 100) }}
                  transition={{ duration: reduce ? 0 : 0.7, ease: EASE }}
                />
              </svg>
              <span
                className="absolute inset-0 grid place-items-center text-lg font-semibold tabular-nums"
                aria-live="polite"
              >
                {result ? score : "…"}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium">
                {result ? GRADE_LABELS[result.grade] : "Checking"}
              </span>
              <Readout>scan score</Readout>
            </div>
          </div>
          <ul className="flex flex-col gap-1.5">
            {checks.map((check) => (
              <li
                key={check.id}
                className="flex min-w-0 items-center gap-1.5 text-xs"
              >
                {check.passed ? (
                  <Tick className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Close className="size-3.5 shrink-0 text-red-500" />
                )}
                <span className="truncate text-muted-foreground">
                  {check.message}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </DemoStage>
      <div className="flex items-center justify-between gap-3 border-t px-4 py-3">
        <Readout>ink</Readout>
        <SegmentedControl
          label="Ink color"
          options={INK_OPTIONS}
          value={ink}
          onChange={setInk}
          size="sm"
        />
      </div>
    </div>
  );
}
