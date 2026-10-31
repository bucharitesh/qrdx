"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Spinner } from "@repo/design-system/components/ui/spinner";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ImageIcon,
  Info,
  RefreshCw,
  ScanLine,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import type { AIArtResult } from "./config";
import { checkScannable, downloadImage, type ScanCheck } from "./image-utils";

interface AIArtResultPanelProps {
  result: AIArtResult | null;
  isGenerating: boolean;
  canRetryLower: boolean;
  onRetryLower: () => void;
  onRegenerate: () => void;
}

export function AIArtResultPanel({
  result,
  isGenerating,
  canRetryLower,
  onRetryLower,
  onRegenerate,
}: AIArtResultPanelProps) {
  const [scan, setScan] = useState<ScanCheck>("checking");
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    if (!result) return;
    let cancelled = false;
    setScan("checking");
    checkScannable(result.imageUrl, result.text).then((status) => {
      if (!cancelled) setScan(status);
    });
    return () => {
      cancelled = true;
    };
  }, [result]);

  const handleDownload = async () => {
    if (!result) return;
    setIsDownloading(true);
    await downloadImage(result.imageUrl, `qrdx-ai-art-${result.seed}`);
    setIsDownloading(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="relative aspect-square w-full overflow-hidden rounded-xl border bg-muted">
        {result ? (
          <img
            src={result.imageUrl}
            alt={`AI-generated QR code artwork that encodes ${result.text}`}
            crossOrigin="anonymous"
            width={result.width ?? undefined}
            height={result.height ?? undefined}
            className="size-full object-cover"
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
            <p className="text-sm font-medium">Generating your artwork…</p>
            <p className="text-muted-foreground text-xs">
              This can take up to a minute.
            </p>
          </div>
        )}
      </div>

      {result && !isGenerating && (
        <>
          <ScanStatus scan={scan} />

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleDownload} disabled={isDownloading}>
              {isDownloading ? <Spinner /> : <Download />}
              Download
            </Button>
            {canRetryLower && (
              <Button variant="outline" onClick={onRetryLower}>
                <ScanLine />
                Retry with lower creativity
              </Button>
            )}
            <Button variant="ghost" onClick={onRegenerate}>
              <RefreshCw />
              New variation
            </Button>
          </div>

          <p className="text-muted-foreground text-xs">
            Creativity {result.creativity} · Seed {result.seed}. Each new image
            uses 1 AI credit.
          </p>
        </>
      )}
    </div>
  );
}

const SCAN_STATUS: Record<
  ScanCheck,
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
    title: "May not scan — try a lower creativity setting",
    description:
      "Our in-browser check couldn't read it. Phone cameras are often more forgiving, so test it too.",
  },
  mismatch: {
    icon: <AlertTriangle className="size-4 text-amber-600" />,
    title: "Scans to different content — try a lower creativity setting",
    description:
      "The decoded text doesn't match what you entered. Don't use this image.",
  },
  unverified: {
    icon: <Info className="text-muted-foreground size-4" />,
    title: "Couldn't run the scan check",
    description: "Test it with a phone camera before printing or sharing it.",
  },
};

function ScanStatus({ scan }: { scan: ScanCheck }) {
  const { icon, title, description } = SCAN_STATUS[scan];
  return (
    <output
      aria-live="polite"
      className="flex items-start gap-3 rounded-lg border p-3"
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-muted-foreground text-xs">{description}</span>
      </span>
    </output>
  );
}
