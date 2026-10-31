"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Spinner } from "@repo/design-system/components/ui/spinner";
import { cn } from "@repo/design-system/lib/utils";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ImageIcon,
  Info,
  Lock,
  ScanLine,
  Sparkles,
  ZoomIn,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import {
  type AIArtResult,
  type AIArtUpscaleResult,
  type AIArtVariant,
  ART_QR_VISIBILITY,
  isFalResultUrl,
} from "./config";
import {
  checkScannable,
  downloadImage,
  pickBestScannable,
  type ScanCheckResult,
  type ScanStatus,
} from "./image-utils";

interface AIArtResultPanelProps {
  result: AIArtResult | null;
  isGenerating: boolean;
  /** Variants the current run will return, for placeholders */
  pendingVariations: number;
  upscaled: Record<string, AIArtUpscaleResult>;
  upscalingUrl: string | null;
  onUpscale: (variant: AIArtVariant) => void;
  onRetryClearer: (variant: AIArtVariant) => void;
  onLockSeed: (seed: number) => void;
}

export function AIArtResultPanel({
  result,
  isGenerating,
  pendingVariations,
  upscaled,
  upscalingUrl,
  onUpscale,
  onRetryClearer,
  onLockSeed,
}: AIArtResultPanelProps) {
  const [checks, setChecks] = useState<(ScanCheckResult | undefined)[]>([]);
  const [selected, setSelected] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const best = pickBestScannable(checks);

  useEffect(() => {
    if (!result) return;
    let cancelled = false;
    setChecks([]);
    setSelected(0);
    // Every variant is decoded in the browser; the best one gets picked.
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
  const big = variant ? upscaled[variant.imageUrl] : undefined;

  const handleDownload = async () => {
    if (!variant) return;
    setDownloading(true);
    await downloadImage(
      big?.imageUrl ?? variant.imageUrl,
      `qrdx-ai-art-${variant.seed}${big ? "-2x" : ""}`,
    );
    setDownloading(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-muted relative aspect-square w-full overflow-hidden rounded-xl border">
        {variant && result ? (
          <img
            alt={`AI-generated QR code artwork that encodes ${result.text}`}
            className="size-full object-cover"
            crossOrigin="anonymous"
            height={variant.height ?? undefined}
            src={variant.imageUrl}
            width={variant.width ?? undefined}
          />
        ) : (
          <div className="text-muted-foreground flex size-full flex-col items-center justify-center gap-2 p-6 text-center text-sm">
            <ImageIcon className="size-8" />
            Your QR art will appear here
          </div>
        )}

        {isGenerating && (
          <div className="bg-background/80 absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center backdrop-blur-sm">
            <Spinner className="size-6" />
            <p className="text-sm font-medium">
              Generating{" "}
              {pendingVariations > 1
                ? `${pendingVariations} variations`
                : "your artwork"}
              …
            </p>
            <p className="text-muted-foreground text-xs">
              This can take up to a minute.
            </p>
          </div>
        )}
      </div>

      {result && result.variants.length > 1 && (
        <div
          aria-label="Variations"
          className="grid grid-cols-4 gap-2"
          role="listbox"
        >
          {result.variants.map((item, index) => (
            <button
              aria-label={`Variation ${index + 1}, seed ${item.seed}`}
              aria-selected={index === selected}
              className={cn(
                "relative aspect-square overflow-hidden rounded-lg border transition-all",
                index === selected
                  ? "border-primary ring-primary/25 ring-2"
                  : "hover:border-primary/50",
              )}
              key={item.imageUrl}
              onClick={() => setSelected(index)}
              role="option"
              type="button"
            >
              <img
                alt=""
                className="size-full object-cover"
                crossOrigin="anonymous"
                src={item.imageUrl}
              />
              <StatusDot status={checks[index]?.status ?? "checking"} />
              {index === best && (
                <span className="bg-primary text-primary-foreground absolute right-1 bottom-1 left-1 rounded px-1 py-0.5 text-center text-[10px] font-medium">
                  Best scannable
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {result && variant && !isGenerating && (
        <>
          <ScanStatusCard
            isBest={selected === best && result.variants.length > 1}
            status={check?.status ?? "checking"}
            score={check?.score ?? null}
          />

          <div className="flex flex-wrap gap-2">
            <Button disabled={downloading} onClick={handleDownload}>
              {downloading ? <Spinner /> : <Download />}
              {big ? "Download 2× (print)" : "Download"}
            </Button>
            {!big && isFalResultUrl(variant.imageUrl) && (
              <Button
                disabled={upscalingUrl !== null}
                onClick={() => onUpscale(variant)}
                variant="outline"
              >
                {upscalingUrl === variant.imageUrl ? <Spinner /> : <ZoomIn />}
                Upscale 2× for print
              </Button>
            )}
            {result.visibility < ART_QR_VISIBILITY.max && (
              <Button onClick={() => onRetryClearer(variant)} variant="outline">
                <ScanLine />
                Retry with a clearer code
              </Button>
            )}
            <Button onClick={() => onLockSeed(variant.seed)} variant="ghost">
              <Lock />
              Lock seed {variant.seed}
            </Button>
          </div>

          <p className="text-muted-foreground text-xs">
            QR visibility {result.visibility} · Creativity {result.creativity}
            {big ? ` · Upscaled to ${big.width ?? 2048} px` : ""}
            {result.failed > 0
              ? ` · ${result.failed} variation${result.failed > 1 ? "s" : ""} failed and ${result.failed > 1 ? "were" : "was"} refunded`
              : ""}
            . Each image and each upscale uses 1 AI art credit.
          </p>
        </>
      )}
    </div>
  );
}

const STATUS_COLORS: Record<ScanStatus, string> = {
  checking: "bg-muted-foreground/60",
  scannable: "bg-emerald-500",
  mismatch: "bg-red-500",
  unreadable: "bg-amber-500",
  unverified: "bg-muted-foreground",
};

function StatusDot({ status }: { status: ScanStatus }) {
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

const SCAN_STATUS: Record<
  ScanStatus,
  { icon: ReactNode; title: string; description: string }
> = {
  checking: {
    icon: <Spinner className="size-4" />,
    title: "Checking that it scans…",
    description: "Decoding the image in your browser.",
  },
  scannable: {
    icon: <CheckCircle2 className="size-4 text-emerald-600" />,
    title: "Scannable ✓",
    description:
      "Our in-browser check decoded it to your content. Still test it with a phone camera before printing.",
  },
  unreadable: {
    icon: <AlertTriangle className="size-4 text-amber-600" />,
    title: "May not scan — try a clearer code",
    description:
      "Our in-browser check couldn't read it. Raise QR visibility, or test with a phone camera, which is often more forgiving.",
  },
  mismatch: {
    icon: <AlertTriangle className="size-4 text-amber-600" />,
    title: "Scans to different content — try a clearer code",
    description:
      "The decoded text doesn't match what you entered. Don't use this image.",
  },
  unverified: {
    icon: <Info className="text-muted-foreground size-4" />,
    title: "Couldn't run the scan check",
    description: "Test it with a phone camera before printing or sharing it.",
  },
};

function ScanStatusCard({
  status,
  score,
  isBest,
}: {
  status: ScanStatus;
  score: number | null;
  isBest: boolean;
}) {
  const { icon, title, description } = SCAN_STATUS[status];
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
              Scan score {score}
            </span>
          )}
          {isBest && (
            <span className="bg-primary/10 text-primary inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs">
              <Sparkles className="size-3" />
              Best of this run
            </span>
          )}
        </span>
        <span className="text-muted-foreground text-xs">{description}</span>
      </span>
    </output>
  );
}
