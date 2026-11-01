"use client";

import { Spinner } from "@repo/design-system/components/icons";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/design-system/components/ui/popover";
import { cn } from "@repo/design-system/lib/utils";
import {
  TickCircle as CircleCheck,
  CloseCircle as CircleX,
} from "iconsax-reactjs";
import Link from "next/link";
import {
  getQRData,
  getScanScore,
  type ScanCheck,
  type ScanGrade,
  type ScanScoreResult,
} from "qrdx";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { InfoHint } from "@/components/help/info-hint";
import { DEFAULT_QR_LOGO } from "@/lib/constants";
import { soundEvent } from "@/lib/sound/emit";
import type { QRStyle } from "@/types/theme";

const SCORE_DEBOUNCE_MS = 700;

export const GRADE_LABELS: Record<ScanGrade, string> = {
  great: "Great",
  ok: "OK",
  risky: "Risky",
  fails: "Fails",
};

export const GRADE_COLORS: Record<ScanGrade, string> = {
  great: "bg-emerald-500",
  ok: "bg-amber-400",
  risky: "bg-orange-500",
  fails: "bg-red-500",
};

export function ScanCheckList({ checks }: { checks: ScanCheck[] }) {
  // Failed checks first, so the fixes are at the top.
  const sorted = [...checks].sort(
    (a, b) => Number(a.passed) - Number(b.passed),
  );
  return (
    <ul className="space-y-2.5">
      {sorted.map((check) => (
        <li className="flex gap-2 text-sm" key={check.id}>
          {check.passed ? (
            <CircleCheck
              className="mt-0.5 size-4 shrink-0 text-emerald-500"
              variant="Bold"
            />
          ) : (
            <CircleX
              className="mt-0.5 size-4 shrink-0 text-red-500"
              variant="Bold"
            />
          )}
          <div className="min-w-0">
            <p className="leading-snug">{check.message}</p>
            {!check.passed && check.fix && (
              <p className="text-muted-foreground mt-0.5 text-xs leading-snug">
                {check.fix}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

interface ScanScoreBadgeProps {
  style: Partial<QRStyle>;
  value: string;
  className?: string;
}

/**
 * "Scan score 92 · Great" badge for the editor preview. Shows a spinner until
 * the first score for the current content is ready; while a style change is
 * re-checked, the previous score stays visible (dimmed) next to a spinner.
 */
export function ScanScoreBadge({
  style,
  value,
  className,
}: ScanScoreBadgeProps) {
  const [scored, setScored] = useState<{
    key: string;
    value: string;
    result: ScanScoreResult;
  } | null>(null);
  const [failed, setFailed] = useState(false);
  // Last pass/fail (score >= 75); a cue plays only when a change crosses it.
  const passed = useRef<boolean | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const lastWidth = useRef<number | null>(null);
  /** The label animates in only when it changes, not on first show. */
  const labelChanged = useRef(false);

  // Same props the preview renders
  const qrProps = useMemo(
    () => ({
      ...getQRData({
        value,
        fgColor: style.fgColor,
        bgColor: style.bgColor,
        eyeColor: style.eyeColor,
        dotColor: style.dotColor,
        bodyPattern: style.bodyPattern,
        hideLogo: !style.showLogo,
        logo: style.customLogo ?? DEFAULT_QR_LOGO,
      }),
      level: style.level,
      cornerEyePattern: style.cornerEyePattern,
      cornerEyeDotPattern: style.cornerEyeDotPattern,
      templateId: style.templateId,
      frame: style.frame,
      margin: style.margin,
      art: style.art,
    }),
    [value, style],
  );
  const propsKey = JSON.stringify(qrProps);

  useEffect(() => {
    if (!value.trim()) {
      return;
    }
    const controller = new AbortController();
    setFailed(false);
    const timer = setTimeout(() => {
      getScanScore(JSON.parse(propsKey), { signal: controller.signal })
        .then((score) => {
          if (!controller.signal.aborted) {
            setScored({ key: propsKey, value, result: score });
            const pass = score.score >= 75;
            if (passed.current !== null && passed.current !== pass) {
              soundEvent(pass ? "good" : "low");
            }
            passed.current = pass;
          }
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) {
            console.error("Scan score failed:", error);
            setFailed(true);
          }
        });
    }, SCORE_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [propsKey, value]);

  // A score for different content is never shown; a style change keeps the
  // last score (dimmed) until the new one lands.
  const result = scored && scored.value === value ? scored.result : null;
  const checking = !failed && scored?.key !== propsKey;
  const hidden = failed && !result;
  const state = result ? `${result.score}-${result.grade}` : "checking";

  // The pill eases to its new width when the label changes (Web Animations,
  // measured before paint); none with reduced motion.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the label changes
  useLayoutEffect(() => {
    const element = button.current;
    if (!element) {
      lastWidth.current = null;
      return;
    }
    const width = element.getBoundingClientRect().width;
    const previous = lastWidth.current;
    lastWidth.current = width;
    labelChanged.current = true;
    if (previous === null) return;
    if (
      Math.abs(previous - width) < 0.5 ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    element.animate([{ width: `${previous}px` }, { width: `${width}px` }], {
      duration: 250,
      easing: "cubic-bezier(.32,.72,0,1)",
    });
  }, [state, hidden]);

  if (hidden) {
    return null;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          ref={button}
          aria-busy={checking}
          aria-label={
            result
              ? `Scan score ${result.score}, ${GRADE_LABELS[result.grade]}. Show checks`
              : "Checking scan score"
          }
          className={cn(
            "bg-background/90 hover:bg-muted inline-flex h-8 items-center gap-2 overflow-hidden rounded-full border px-3 text-xs font-medium whitespace-nowrap shadow-sm backdrop-blur transition-colors",
            className,
          )}
          type="button"
        >
          <span className="relative grid size-3.5 shrink-0 place-items-center">
            {checking ? (
              <Spinner className="text-muted-foreground size-3.5" />
            ) : result ? (
              <span
                className={cn(
                  "size-2 rounded-full",
                  GRADE_COLORS[result.grade],
                )}
              />
            ) : null}
          </span>
          <span
            className={cn(
              "tabular-nums transition-opacity",
              checking && result && "opacity-60",
              labelChanged.current &&
                "animate-in fade-in-0 slide-in-from-bottom-1 blur-in-2 duration-200 ease-[cubic-bezier(.32,.72,0,1)] motion-reduce:animate-none",
            )}
            key={state}
          >
            {result
              ? `Scan score ${result.score} · ${GRADE_LABELS[result.grade]}`
              : "Checking scan…"}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-80" side="top">
        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-semibold">
              Will it scan? <InfoHint id="scan-score" side="right" />
            </h3>
            {result && (
              <span className="text-muted-foreground text-xs tabular-nums">
                {result.score}/100 · {GRADE_LABELS[result.grade]}
              </span>
            )}
          </div>
          {result ? (
            <ScanCheckList checks={result.checks} />
          ) : (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <Spinner className="size-4" />
              Decoding your design at a few sizes…
            </p>
          )}
          <p className="text-muted-foreground border-t pt-3 text-xs leading-relaxed">
            Simulated in your browser with the open-source jsQR decoder at a few
            sizes with camera blur. Phone apps vary, so test-scan before you
            print.{" "}
            <Link
              className="text-foreground font-medium underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground"
              href="/tools/scan-checker"
            >
              Check a printed code
            </Link>
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
