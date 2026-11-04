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
        toast.error("The print-size copy didn't pass the scan check", {
          description: `Download the ${variant.width} px image instead.`,
        });
        return;
      }
      saveBlob(blob, `qrdx-ai-art-${variant.seed}-${ART_PRINT_SIZE}px`);
      track("qr_downloaded", { format: "ai-art-print", source: "ai_art" });
    } catch {
      toast.error("Couldn't prepare the print-size image");
    } finally {
      setPreparingPrint(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-muted relative aspect-square w-full overflow-hidden rounded-xl border">
        {variant && result ? (
          <img
            alt={`AI-generated QR code artwork that encodes ${result.text}`}
            className="size-full object-cover"
            height={variant.height}
            src={variant.imageUrl}
            width={variant.width}
          />
        ) : (
          <div className="text-muted-foreground flex size-full flex-col items-center justify-center gap-2 p-6 text-center text-sm">
            <Gallery className="size-8" />
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
              Each image is checked to scan before you see it. This can take up
              to a minute.
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
              aria-label={
                onLockSeed
                  ? `Variation ${index + 1}, seed ${item.seed}`
                  : `Variation ${index + 1}`
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
            blend={variant.blend}
            blendStrength={variant.blendStrength}
            isBest={selected === best && result.variants.length > 1}
            score={check?.score ?? null}
            status={check?.status ?? "checking"}
          />

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleDownload}>
              <Import />
              Download
            </Button>
            <Button
              disabled={preparingPrint}
              onClick={handlePrintDownload}
              variant="outline"
            >
              {preparingPrint ? <Spinner /> : <DocumentDownload />}
              Print size ({ART_PRINT_SIZE} px)
            </Button>
            {result.visibility < ART_QR_VISIBILITY.max && (
              <Button onClick={() => onRetryClearer(variant)} variant="outline">
                <ScanBarcode />
                Retry with a clearer code
              </Button>
            )}
            {onLockSeed && (
              <Button onClick={() => onLockSeed(variant.seed)} variant="ghost">
                <Lock />
                Lock seed {variant.seed}
              </Button>
            )}
          </div>

          <p className="text-muted-foreground text-xs">
            QR visibility {result.visibility} · Creativity {result.creativity} ·{" "}
            {variant.width} px
            {result.failed > 0
              ? ` · ${result.failed} variation${result.failed > 1 ? "s" : ""} failed and used no credit`
              : ""}
            . Each image uses 1 AI art credit; the print-size download is free.
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

export const SCAN_STATUS: Record<
  ScanStatus,
  { icon: ReactNode; title: string; description: string }
> = {
  checking: {
    icon: <Spinner className="size-4" />,
    title: "Scoring the scan…",
    description: "Decoded on the server; now testing it shrunk and blurred.",
  },
  scannable: {
    icon: (
      <TickCircle className="size-4 text-emerald-600 dark:text-emerald-400" />
    ),
    title: "Verified to scan",
    description:
      "Decoded to your content on our server and again in your browser. Still test it with a phone camera before printing.",
  },
  unreadable: {
    icon: <Warning2 className="size-4 text-amber-600 dark:text-amber-400" />,
    title: "Hard to read when small — try a clearer code",
    description:
      "It decoded on our server, but not in the in-browser test. Raise QR visibility, or test with a phone camera before using it.",
  },
  mismatch: {
    icon: <Warning2 className="size-4 text-amber-600 dark:text-amber-400" />,
    title: "Scans to different content — try a clearer code",
    description:
      "The decoded text doesn't match what you entered. Don't use this image.",
  },
  unverified: {
    icon: <InfoCircle className="text-muted-foreground size-4" />,
    title: "Couldn't run the in-browser check",
    description:
      "It decoded on our server. Test it with a phone camera before printing or sharing it.",
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
            <span className="bg-muted text-foreground inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
              <MedalStar className="size-3" />
              Best of this run
            </span>
          )}
        </span>
        <span className="text-muted-foreground text-xs">{description}</span>
        {blend === "least" && (
          <span className="text-muted-foreground text-xs">
            The model's image didn't scan as drawn, so QRdx strengthened its
            corner eyes, its border and, where needed, its modules, just enough
            to scan (blend strength {Math.round(blendStrength * 100)}%).
          </span>
        )}
        {blend === "image-qr" && (
          <span className="text-muted-foreground text-xs">
            The model's image didn't scan even with its code strengthened, so
            QRdx redrew it as an Image QR code, with the picture showing
            through.
          </span>
        )}
      </span>
    </output>
  );
}
