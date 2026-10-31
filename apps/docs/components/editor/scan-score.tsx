"use client";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/design-system/components/ui/popover";
import { cn } from "@repo/design-system/lib/utils";
import { CircleCheck, CircleX, LoaderCircle } from "lucide-react";
import Link from "next/link";
import {
  getQRData,
  getScanScore,
  type ScanCheck,
  type ScanGrade,
  type ScanScoreResult,
} from "qrdx";
import { useEffect, useMemo, useState } from "react";
import { DEFAULT_QR_LOGO } from "@/lib/constants";
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
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-500" />
          ) : (
            <CircleX className="mt-0.5 size-4 shrink-0 text-red-500" />
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

/** "Scan score 92 · Great" badge for the editor preview. */
export function ScanScoreBadge({
  style,
  value,
  className,
}: ScanScoreBadgeProps) {
  const [result, setResult] = useState<ScanScoreResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [failed, setFailed] = useState(false);

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
    setChecking(true);
    const timer = setTimeout(() => {
      getScanScore(JSON.parse(propsKey), { signal: controller.signal })
        .then((score) => {
          setResult(score);
          setFailed(false);
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) {
            console.error("Scan score failed:", error);
            setFailed(true);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setChecking(false);
          }
        });
    }, SCORE_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [propsKey, value]);

  if (failed && !result) {
    return null;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label={
            result
              ? `Scan score ${result.score}, ${GRADE_LABELS[result.grade]}. Show checks`
              : "Checking scan score"
          }
          className={cn(
            "bg-background/90 hover:bg-muted inline-flex h-8 items-center gap-2 rounded-full border px-3 text-xs font-medium shadow-sm backdrop-blur transition-colors",
            className,
          )}
          type="button"
        >
          {result ? (
            <span
              className={cn(
                "size-2 rounded-full",
                GRADE_COLORS[result.grade],
                checking && "animate-pulse",
              )}
            />
          ) : (
            <LoaderCircle className="size-3.5 animate-spin" />
          )}
          {result ? (
            <span className="tabular-nums">
              Scan score {result.score} · {GRADE_LABELS[result.grade]}
            </span>
          ) : (
            <span>Checking scan score…</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-80" side="top">
        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-semibold">Will it scan?</h3>
            {result && (
              <span className="text-muted-foreground text-xs tabular-nums">
                {result.score}/100 · {GRADE_LABELS[result.grade]}
              </span>
            )}
          </div>
          {result ? (
            <ScanCheckList checks={result.checks} />
          ) : (
            <p className="text-muted-foreground text-sm">Checking…</p>
          )}
          <p className="text-muted-foreground border-t pt-3 text-xs leading-relaxed">
            Simulated in your browser with the open-source jsQR decoder at a few
            sizes with camera blur. Phone apps vary, so test-scan before you
            print.{" "}
            <Link className="underline" href="/tools/scan-checker">
              Check a printed code
            </Link>
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
