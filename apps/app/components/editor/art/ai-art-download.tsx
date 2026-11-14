"use client";

import { track } from "@repo/analytics";
import { toast } from "@repo/design-system";
import { ModuleOrbit } from "@repo/design-system/components/loaders";
import { Button } from "@repo/design-system/components/ui/button";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@repo/design-system/components/ui/revola";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@repo/design-system/components/ui/toggle-group";
import { Gallery, Image, Import, Printer } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { DialogCloseButton } from "@/components/editor/dialog-close-button";
import type { AIArtRun } from "@/components/sections/ai-art/ai-art-run";
import {
  type AIArtVariant,
  ART_PRINT_SIZE,
} from "@/components/sections/ai-art/config";
import {
  createPrintImage,
  downloadImage,
  saveBlob,
} from "@/components/sections/ai-art/image-utils";
import { soundEvent } from "@/lib/sound/emit";
import { applyResultAsImageQR } from "./art-canvas";

/** Why the dialog offers only PNG while AI art is shown. */
export const AI_ART_DOWNLOAD_REASON =
  "AI art is an image; for SVG, PDF or EPS use Use as Image QR";

type ArtFormat = "png" | "print";

/**
 * The download dialog while an AI art result covers the preview: the image as
 * PNG, or the print-size PNG (resampled and checked to scan again).
 */
export function AIArtDownloadDialog({
  open,
  onOpenChange,
  result,
  variant,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: AIArtRun;
  variant: AIArtVariant;
}) {
  const t = useTranslations("editor.art.aiArtDownload");
  const [format, setFormat] = useState<ArtFormat>("png");
  const [busy, setBusy] = useState<"download" | "image-qr" | null>(null);

  const download = async () => {
    if (format === "png") {
      downloadImage(variant.imageUrl, `qrdx-ai-art-${variant.seed}`);
      track("qr_downloaded", { format: "ai-art", source: "playground" });
      onOpenChange(false);
      return;
    }
    setBusy("download");
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
      track("qr_downloaded", { format: "ai-art-print", source: "playground" });
      onOpenChange(false);
    } catch {
      toast.error(t("couldntPrepareThePrintSize"));
    } finally {
      setBusy(null);
    }
  };

  const turnIntoImageQR = async () => {
    setBusy("image-qr");
    try {
      await applyResultAsImageQR(variant.imageUrl);
      soundEvent("apply");
      // The dialog stays: it now offers every format for the vector code.
      toast.success(t("nowAnImageQrCode"), {
        description: t("pickSvgPdfOrEps"),
      });
    } catch {
      toast.error(t("couldntTurnThisImageInto"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <ResponsiveDialog onOpenChange={onOpenChange} open={open}>
      <ResponsiveDialogContent className="max-h-[92dvh] gap-0 overflow-hidden p-0 sm:max-w-[34rem] dark:!border-border">
        <ResponsiveDialogHeader className="flex-row items-start gap-3 px-6 pt-1 pb-0 text-left sm:pt-6">
          <div className="min-w-0 flex-1 space-y-1">
            <ResponsiveDialogTitle>{t("downloadAiArt")}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {AI_ART_DOWNLOAD_REASON}.
            </ResponsiveDialogDescription>
          </div>
          <DialogCloseButton className="-mt-1 -mr-2 hidden sm:inline-flex" />
        </ResponsiveDialogHeader>

        <div className="grid gap-6 overflow-y-auto px-6 py-6 sm:grid-cols-[9rem_1fr]">
          <img
            alt={t("aiGeneratedQrCodeArtwork", { text: result.text })}
            className="mx-auto aspect-square w-full max-w-36 rounded-[14px] border object-cover"
            height={variant.height}
            src={variant.imageUrl}
            width={variant.width}
          />
          <div className="min-w-0 space-y-4">
            <ToggleGroup
              aria-label={t("format")}
              className="grid w-full grid-cols-2"
              onValueChange={(next) => next && setFormat(next as ArtFormat)}
              type="single"
              value={format}
              variant="outline"
            >
              <ToggleGroupItem
                className="h-16 flex-col gap-0.5 px-2"
                value="png"
              >
                <span className="flex items-center gap-1.5 text-xs font-medium">
                  <Image className="size-4" />
                  PNG
                </span>
                <span className="text-muted-foreground text-[11px] tabular-nums">
                  {t("widthPx", { width: variant.width })}
                </span>
              </ToggleGroupItem>
              <ToggleGroupItem
                className="h-16 flex-col gap-0.5 px-2"
                value="print"
              >
                <span className="flex items-center gap-1.5 text-xs font-medium">
                  <Printer className="size-4" />
                  {t("printPng")}
                </span>
                <span className="text-muted-foreground text-[11px] tabular-nums">
                  {t("artPrintSizePxChecked", { ART_PRINT_SIZE })}
                </span>
              </ToggleGroupItem>
            </ToggleGroup>
            <div className="flex flex-col gap-2">
              <Button disabled={busy !== null} onClick={download}>
                {busy === "download" ? <ModuleOrbit aria-hidden /> : <Import />}
                {format === "png" ? t("downloadPng") : t("downloadPrintPng")}
              </Button>
              <Button
                disabled={busy !== null}
                onClick={turnIntoImageQR}
                variant="outline"
              >
                {busy === "image-qr" ? (
                  <ModuleOrbit aria-hidden />
                ) : (
                  <Gallery />
                )}
                {t("useAsImageQr")}
              </Button>
            </div>
          </div>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
