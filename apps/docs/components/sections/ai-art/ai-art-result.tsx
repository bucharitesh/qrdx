"use client";

import { toast } from "@repo/design-system";
import { Button } from "@repo/design-system/components/ui/button";
import { Spinner } from "@repo/design-system/components/ui/spinner";
import { cn } from "@repo/design-system/lib/utils";
import {
  DocumentDownload,
  Gallery,
  Import,
  InfoCircle,
  Lock,
  MedalStar,
  ScanBarcode,
  TickCircle,
  Warning2,
} from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useState } from "react";
import { track } from "@/lib/analytics";
import type { AIArtRun } from "./ai-art-run";
import { type AIArtVariant, ART_PRINT_SIZE, ART_QR_VISIBILITY } from "./config";
import {
  checkScannable,
  createPrintImage,
  downloadImage,
  pickBestScannable,
  type ScanCheckResult,
  type ScanStatus,
  saveBlob,
} from "./image-utils";

export type { AIArtRun } from "./ai-art-run";

interface AIArtResultPanelProps {
  result: AIArtRun | null;
  isGenerating: boolean;
  /** Variants the current run will return, for placeholders */
  pendingVariations: number;
  onRetryClearer: (variant: AIArtVariant) => void;
  /** Unset when the art model ignores seeds: there's nothing to lock */
  onLockSeed?: (seed: number) => void;
}

export function AIArtResultPanel({
  result,
  isGenerating,
  pendingVariations,
  onRetryClearer,
  onLockSeed,
}: AIArtResultPanelProps) {
  const t = useTranslations("aiArt.aiArtResult");
  const [checks, setChecks] = useState<(ScanCheckResult | undefined)[]>([]);
  const [selected, setSelected] = useState(0);
  const [preparingPrint, setPreparingPrint] = useState(false);
  const best = pickBestScannable(checks);

  useEffect(() => {
    if (!result) return;
    let cancelled = false;
    setChecks([]);
    setSelected(0);
    // Every image was decoded on the server; the browser scores how well
    // each one survives shrinking and blur, and picks the best.
    result.variants.forEach((variant, index) => {
      checkScannable(variant.imageUrl, result.text).then((check) => {
        if (cancelled) return;
        setChecks((previous) => {
          const next = [...previous];
          next[index] = check;
          return next;
        });
      });
    });
    return () => {
      cancelled = true;
    };
  }, [result]);

  const allChecked =
    result?.variants.every((_, index) => checks[index] !== undefined) ?? false;
  useEffect(() => {
    if (allChecked && best >= 0) setSelected(best);
  }, [allChecked, best]);

  const variant = result?.variants[selected];
  const check = checks[selected];

  const handleDownload = () => {
    if (!variant) return;
    downloadImage(variant.imageUrl, `qrdx-ai-art-${variant.seed}`);
    track("qr_downloaded", { format: "ai-art", source: "ai_art" });
  };

  const handlePrintDownload = async () => {
    if (!(variant && result)) return;
    setPreparingPrint(true);
    try {
      const blob = await createPrintImage(
        variant.imageUrl,
        result.text,
        ART_PRINT_SIZE,
      );
      if (!blob) {
        toast.error(t("thePrintSizeCopyDidnt"), {
          description: t("downloadTheWidthPxImage", { width: variant.width }),
        });
        return;
      }
      saveBlob(blob, `qrdx-ai-art-${variant.seed}-${ART_PRINT_SIZE}px`);
      track("qr_downloaded", { format: "ai-art-print", source: "ai_art" });
    } catch {
      toast.error(t("couldntPrepareThePrintSize"));
    } finally {
      setPreparingPrint(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-muted relative aspect-square w-full overflow-hidden rounded-xl border">
        {variant && result ? (
          <img
            alt={t("aiGeneratedQrCodeArtwork", { text: result.text })}
            className="size-full object-cover"
            height={variant.height}
            src={variant.imageUrl}
            width={variant.width}
          />
        ) : (
          <div className="text-muted-foreground flex size-full flex-col items-center justify-center gap-2 p-6 text-center text-sm">
            <Gallery className="size-8" />
            {t("yourQrArtWillAppear")}
          </div>
        )}

        {isGenerating && (
          <div className="bg-background/80 absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center backdrop-blur-sm">
            <Spinner className="size-6" />
            <p className="text-sm font-medium">
              {t("generating")}{" "}
              {pendingVariations > 1
                ? t("pendingvariationsVariations", { pendingVariations })
                : t("yourArtwork")}
              …
            </p>
            <p className="text-muted-foreground text-xs">
              {t("eachImageIsCheckedTo")}
            </p>
          </div>
        )}
      </div>

      {result && result.variants.length > 1 && (
        <div
          aria-label={t("variations")}
          className="grid grid-cols-4 gap-2"
          role="listbox"
        >
          {result.variants.map((item, index) => (
            <button
              aria-label={
                onLockSeed
                  ? t("variationValueSeedSeed", {
                      value: index + 1,
                      seed: item.seed,
                    })
                  : t("variationValue", { value: index + 1 })
              }
              aria-selected={index === selected}
              className={cn(
                "relative aspect-square overflow-hidden rounded-lg border transition-all",
                index === selected
                  ? "border-foreground ring-foreground/15 ring-2"
                  : "hover:border-foreground/30",
              )}
              key={`${item.seed}-${index}`}
              onClick={() => setSelected(index)}
              role="option"
              type="button"
            >
              <img
                alt=""
                className="size-full object-cover"
                src={item.imageUrl}
              />
              <StatusDot status={checks[index]?.status ?? "checking"} />
              {index === best && (
                <span className="bg-foreground text-background absolute right-1 bottom-1 left-1 rounded-full px-1 py-0.5 text-center text-[10px] font-medium">
                  {t("bestScannable")}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {result && variant && !isGenerating && (
        <>
          <ScanStatusCard
            blend={variant.blend}
            blendStrength={variant.blendStrength}
            isBest={selected === best && result.variants.length > 1}
            score={check?.score ?? null}
            status={check?.status ?? "checking"}
          />

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleDownload}>
              <Import />
              {t("download")}
            </Button>
            <Button
              disabled={preparingPrint}
              onClick={handlePrintDownload}
              variant="outline"
            >
              {preparingPrint ? <Spinner /> : <DocumentDownload />}
              {t("printSize")}
              {ART_PRINT_SIZE} {t("px")}
            </Button>
            {result.visibility < ART_QR_VISIBILITY.max && (
              <Button onClick={() => onRetryClearer(variant)} variant="outline">
                <ScanBarcode />
                {t("retryWithAClearerCode")}
              </Button>
            )}
            {onLockSeed && (
              <Button onClick={() => onLockSeed(variant.seed)} variant="ghost">
                <Lock />
                {t("lockSeedSeed", { seed: variant.seed })}
              </Button>
            )}
          </div>

          <p className="text-muted-foreground text-xs">
            {t("resultSummary", {
              visibility: result.visibility,
              creativity: result.creativity,
              width: variant.width,
              failed: result.failed,
            })}
          </p>
        </>
      )}
    </div>
  );
}

export const STATUS_COLORS: Record<ScanStatus, string> = {
  checking: "bg-muted-foreground/60",
  scannable: "bg-emerald-500",
  mismatch: "bg-red-500",
  unreadable: "bg-amber-500",
  unverified: "bg-muted-foreground",
};

export function StatusDot({ status }: { status: ScanStatus }) {
  return (
    <span
      aria-hidden
      className={cn(
        "ring-background absolute top-1.5 right-1.5 size-2.5 rounded-full ring-2",
        STATUS_COLORS[status],
        status === "checking" && "animate-pulse",
      )}
    />
  );
}

// Titles and descriptions: aiArt.aiArtResult.status.<status>.
export const SCAN_STATUS: Record<ScanStatus, { icon: ReactNode }> = {
  checking: {
    icon: <Spinner className="size-4" />,
  },
  scannable: {
    icon: (
      <TickCircle className="size-4 text-emerald-600 dark:text-emerald-400" />
    ),
  },
  unreadable: {
    icon: <Warning2 className="size-4 text-amber-600 dark:text-amber-400" />,
  },
  mismatch: {
    icon: <Warning2 className="size-4 text-amber-600 dark:text-amber-400" />,
  },
  unverified: {
    icon: <InfoCircle className="text-muted-foreground size-4" />,
  },
};

export function ScanStatusCard({
  status,
  score,
  isBest,
  blend,
  blendStrength,
}: {
  status: ScanStatus;
  score: number | null;
  isBest: boolean;
  blend: AIArtVariant["blend"];
  blendStrength: number;
}) {
  const t = useTranslations("aiArt.aiArtResult");
  const { icon } = SCAN_STATUS[status];
  const title = t(`status.${status}.title`);
  const description = t(`status.${status}.description`);
  return (
    <output
      aria-live="polite"
      className="flex items-start gap-3 rounded-lg border p-3"
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="flex flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {title}
          {score !== null && (
            <span className="text-muted-foreground font-normal tabular-nums">
              {t("scanScoreScore", { score })}
            </span>
          )}
          {isBest && (
            <span className="bg-muted text-foreground inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
              <MedalStar className="size-3" />
              {t("bestOfThisRun")}
            </span>
          )}
        </span>
        <span className="text-muted-foreground text-xs">{description}</span>
        {blend === "least" && (
          <span className="text-muted-foreground text-xs">
            {t("theModelsImageDidntScan", {
              value: Math.round(blendStrength * 100),
            })}
          </span>
        )}
        {blend === "image-qr" && (
          <span className="text-muted-foreground text-xs">
            {t("theModelsImageDidntScan2")}
          </span>
        )}
      </span>
    </output>
  );
}
