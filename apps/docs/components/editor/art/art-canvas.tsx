"use client";

import { toast } from "@repo/design-system";
import { Close } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { Spinner } from "@repo/design-system/components/ui/spinner";
import { useIsMobile } from "@repo/design-system/hooks/use-mobile";
import { cn } from "@repo/design-system/lib/utils";
import {
  ArrowLeft,
  DocumentDownload,
  Gallery,
  Import,
  Scan,
  ScanBarcode,
} from "iconsax-reactjs";
import { loadQRArtImage } from "qrdx";
import { useEffect, useState } from "react";
import { useAvailability } from "@/components/availability-provider";
import { withArtImage } from "@/components/editor/control-sections/art-controls";
import {
  ScanStatusCard,
  STATUS_COLORS,
  StatusDot,
} from "@/components/sections/ai-art/ai-art-result";
import type { AIArtRun } from "@/components/sections/ai-art/ai-art-run";
import {
  type AIArtVariant,
  ART_PRINT_SIZE,
  ART_QR_VISIBILITY,
} from "@/components/sections/ai-art/config";
import {
  checkScannable,
  createPrintImage,
  downloadImage,
  pickBestScannable,
  saveBlob,
} from "@/components/sections/ai-art/image-utils";
import { useAIArtRun } from "@/components/sections/ai-art/use-ai-art-run";
import { track } from "@/lib/analytics";
import { useControlsTabFromUrl } from "@/lib/hooks/use-controls-tab-from-url";
import { soundEvent } from "@/lib/sound/emit";
import { useArtSessionStore } from "@/store/art-session-store";
import { useQREditorStore } from "@/store/editor-store";
import { artRequestFor } from "./ai-art-intent";

const displayLink = (text: string) => text.replace(/^https?:\/\//, "");

export interface ShownArt {
  /** The canvas covers the preview */
  visible: boolean;
  /** The results shown, when they encode the editor's content */
  result: AIArtRun | null;
  variant: AIArtVariant | null;
  /** A run is in flight */
  generating: boolean;
  pendingVariations: number;
}

/**
 * Whether an AI art result covers the preview: on the Art tab in AI art mode,
 * until Back to code, and only while it encodes the editor's content. The
 * download dialog reads this too (PNG only while it's shown).
 */
export function useShownArt(): ShownArt {
  const { tab } = useControlsTabFromUrl();
  const aiArt = useAvailability().has("aiArt");
  const configured = useArtSessionStore((state) => state.configured);
  const picked = useArtSessionStore((state) => state.picked);
  const canvasOpen = useArtSessionStore((state) => state.canvasOpen);
  const run = useArtSessionStore((state) => state.run);
  const pending = useArtSessionStore((state) => state.pending);
  const selected = useArtSessionStore((state) => state.selected);
  const payload = useQREditorStore((state) => state.value).trim();

  const active =
    aiArt && configured && tab === "art" && picked === "ai" && canvasOpen;
  const result = active && run && run.text === payload ? run : null;
  return {
    visible: active && (result !== null || pending > 0),
    result,
    variant: result
      ? (result.variants[Math.min(selected, result.variants.length - 1)] ??
        null)
      : null,
    generating: active && pending > 0,
    pendingVariations: pending,
  };
}

/** Runs already given their best variation, so a remount doesn't pick again. */
const autoPicked = new WeakSet<AIArtRun>();

/** Scores each variation in the browser (once per run) and selects the best. */
function useRunChecks(run: AIArtRun | null) {
  const checks = useArtSessionStore((state) => state.checks);
  const results = run && checks.run === run ? checks.results : [];
  const allChecked =
    run?.variants.every((_, index) => results[index] !== undefined) ?? false;
  const best = pickBestScannable(results);

  useEffect(() => {
    if (!run) return;
    let cancelled = false;
    const done = useArtSessionStore.getState().checks;
    run.variants.forEach((variant, index) => {
      if (done.run === run && done.results[index]) return;
      checkScannable(variant.imageUrl, run.text).then((result) => {
        if (!cancelled) {
          useArtSessionStore.getState().setCheck(run, index, result);
        }
      });
    });
    return () => {
      cancelled = true;
    };
  }, [run]);

  useEffect(() => {
    if (!(run && allChecked) || best < 0 || autoPicked.has(run)) return;
    autoPicked.add(run);
    useArtSessionStore.getState().select(best);
  }, [run, allChecked, best]);

  return { results, best };
}

/**
 * Turns an AI art image into the design's Image QR art (sampled with
 * loadQRArtImage, as an upload would be): a vector code again, for SVG, PDF
 * and EPS. One undo step.
 */
export async function applyResultAsImageQR(imageUrl: string): Promise<void> {
  const image = await loadQRArtImage(imageUrl, { mode: "halftone" });
  const editor = useQREditorStore.getState();
  editor.setThemeState({
    ...editor.themeState,
    styles: withArtImage(editor.themeState.styles, image, "halftone"),
  });
  const session = useArtSessionStore.getState();
  session.setSource(imageUrl);
  session.pick(null);
  session.setCanvasOpen(false);
}

/** Download PNG, Print PNG, Use as Image QR and Retry clearer for one result. */
export function ArtResultActions({
  result,
  variant,
  className,
}: {
  result: AIArtRun;
  variant: AIArtVariant;
  className?: string;
}) {
  const art = useAIArtRun({ store: useArtSessionStore });
  const [busy, setBusy] = useState<"print" | "image-qr" | null>(null);

  const download = () => {
    downloadImage(variant.imageUrl, `qrdx-ai-art-${variant.seed}`);
    track("qr_downloaded", { format: "ai-art", source: "playground" });
  };

  const downloadPrint = async () => {
    setBusy("print");
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
      track("qr_downloaded", { format: "ai-art-print", source: "playground" });
    } catch {
      toast.error("Couldn't prepare the print-size image");
    } finally {
      setBusy(null);
    }
  };

  const turnIntoImageQR = async () => {
    setBusy("image-qr");
    try {
      await applyResultAsImageQR(variant.imageUrl);
      soundEvent("apply");
      toast.success("Now an Image QR code", {
        description: "It's vector art: download it as SVG, PDF or EPS.",
        action: {
          label: "Undo",
          onClick: () => useQREditorStore.getState().undo(),
        },
      });
    } catch {
      toast.error("Couldn't turn this image into an Image QR code");
    } finally {
      setBusy(null);
    }
  };

  const retry = () => {
    const { draft } = useArtSessionStore.getState();
    void art.retryClearer(artRequestFor(result.text, draft), variant, {
      preset: draft.presetId,
    });
  };

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      <Button onClick={download} size="sm">
        <Import />
        Download PNG
      </Button>
      <Button
        aria-label={`Print PNG, ${ART_PRINT_SIZE} px`}
        disabled={busy !== null}
        onClick={downloadPrint}
        size="sm"
        title={`${ART_PRINT_SIZE} px, checked to scan again`}
        variant="outline"
      >
        {busy === "print" ? <Spinner /> : <DocumentDownload />}
        Print PNG
      </Button>
      <Button
        disabled={busy !== null}
        onClick={turnIntoImageQR}
        size="sm"
        variant="outline"
      >
        {busy === "image-qr" ? <Spinner /> : <Gallery />}
        Use as Image QR
      </Button>
      {result.visibility < ART_QR_VISIBILITY.max && (
        <Button
          disabled={art.isGenerating}
          onClick={retry}
          size="sm"
          variant="outline"
        >
          <ScanBarcode />
          Retry clearer
        </Button>
      )}
    </div>
  );
}

/** Thumbnails of a run's variations, with their scan check and the best one marked. */
function VariantStrip({
  result,
  selected,
  results,
  best,
  compact,
}: {
  result: AIArtRun;
  selected: number;
  results: ReturnType<typeof useRunChecks>["results"];
  best: number;
  compact: boolean;
}) {
  const select = useArtSessionStore((state) => state.select);
  if (result.variants.length < 2) return null;
  return (
    <div
      aria-label="Variations"
      className={cn("flex gap-2", compact ? "justify-start" : "justify-center")}
      role="listbox"
    >
      {result.variants.map((item, index) => (
        <button
          aria-label={`Variation ${index + 1}${index === best ? ", best to scan" : ""}`}
          aria-selected={index === selected}
          className={cn(
            "relative aspect-square shrink-0 overflow-hidden rounded-lg border transition-[border-color,box-shadow]",
            compact ? "size-9" : "size-16",
            index === selected
              ? "border-foreground ring-foreground/15 ring-2"
              : "hover:border-foreground/30",
          )}
          key={`${item.seed}-${index}`}
          onClick={() => select(index)}
          role="option"
          type="button"
        >
          <img alt="" className="size-full object-cover" src={item.imageUrl} />
          <StatusDot status={results[index]?.status ?? "checking"} />
        </button>
      ))}
    </div>
  );
}

/**
 * An AI art result over the preview (the Art tab's AI art mode): the image,
 * its variations and their scan check, the actions (in the panel below on
 * phones, where the preview is short) and Back to code.
 */
export function ArtCanvas() {
  const shown = useShownArt();
  const isMobile = useIsMobile();
  const selected = useArtSessionStore((state) => state.selected);
  const setCanvasOpen = useArtSessionStore((state) => state.setCanvasOpen);
  const { results, best } = useRunChecks(shown.result);

  if (!shown.visible) return null;
  const { result, variant, generating } = shown;
  const check = results[selected];
  const back = () => setCanvasOpen(false);

  return (
    <section
      aria-label="AI art result"
      className="bg-background absolute inset-0 z-20 flex flex-col"
    >
      <div className="flex items-center gap-3 px-4 pt-3 md:pt-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-medium">AI art</h2>
          {result && (
            <p className="text-muted-foreground truncate text-xs">
              Encodes {displayLink(result.text)}
            </p>
          )}
        </div>
        {isMobile ? (
          <Button
            aria-label="Back to code"
            onClick={back}
            size="icon-sm"
            variant="ghost"
          >
            <Close />
          </Button>
        ) : (
          <Button onClick={back} size="sm" variant="ghost">
            <ArrowLeft />
            Back to code
          </Button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center p-3 [container-type:size] md:p-4">
        <div
          className="bg-muted relative overflow-hidden rounded-xl border"
          style={{
            width: "min(100cqw, 100cqh)",
            height: "min(100cqw, 100cqh)",
          }}
        >
          {variant && result ? (
            <img
              alt={`AI-generated QR code artwork that encodes ${result.text}`}
              className="size-full object-cover"
              height={variant.height}
              src={variant.imageUrl}
              width={variant.width}
            />
          ) : (
            <div className="text-muted-foreground flex size-full items-center justify-center">
              <Scan aria-hidden className="size-8" />
            </div>
          )}
          {generating && (
            <div className="bg-background/80 absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center backdrop-blur-sm">
              <Spinner className="size-5" />
              <p className="text-sm font-medium">
                Generating{" "}
                {shown.pendingVariations > 1
                  ? `${shown.pendingVariations} variations`
                  : "your artwork"}
                …
              </p>
              {!isMobile && (
                <p className="text-muted-foreground max-w-60 text-xs text-pretty">
                  Each image is checked to scan before you see it. This can take
                  up to a minute.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {result && variant && (
        <div
          className={cn(
            "mx-auto w-full",
            isMobile
              ? "flex items-center gap-3 px-4 pb-5"
              : "max-w-2xl space-y-3 px-4 pb-4",
          )}
        >
          <VariantStrip
            best={best}
            compact={isMobile}
            result={result}
            results={results}
            selected={selected}
          />
          {isMobile ? (
            <p
              aria-live="polite"
              className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs"
            >
              <span
                aria-hidden
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  STATUS_COLORS[check?.status ?? "checking"],
                )}
              />
              <span className="truncate">
                {check?.status === "scannable"
                  ? `Verified to scan · Scan score ${check.score}`
                  : check
                    ? "Check before printing"
                    : "Scoring the scan…"}
              </span>
            </p>
          ) : (
            <>
              <ScanStatusCard
                blend={variant.blend}
                blendStrength={variant.blendStrength}
                isBest={selected === best && result.variants.length > 1}
                score={check?.score ?? null}
                status={check?.status ?? "checking"}
              />
              {!generating && (
                <ArtResultActions
                  className="justify-center"
                  result={result}
                  variant={variant}
                />
              )}
              <p className="text-muted-foreground text-center text-xs text-pretty">
                QR visibility {result.visibility} · Creativity{" "}
                {result.creativity} · PNG {variant.width} px, Print PNG{" "}
                {ART_PRINT_SIZE} px
                {result.failed > 0
                  ? ` · ${result.failed} variation${result.failed > 1 ? "s" : ""} failed and used no credit`
                  : ""}
                . For SVG, PDF or EPS, use it as Image QR.
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
