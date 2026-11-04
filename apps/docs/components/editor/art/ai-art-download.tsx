"use client";

import { toast } from "@repo/design-system";
import { Spinner } from "@repo/design-system/components/icons";
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
import { track } from "@/lib/analytics";
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
        toast.error("The print-size copy didn't pass the scan check", {
          description: `Download the ${variant.width} px image instead.`,
        });
        return;
      }
      saveBlob(blob, `qrdx-ai-art-${variant.seed}-${ART_PRINT_SIZE}px`);
      track("qr_downloaded", { format: "ai-art-print", source: "playground" });
      onOpenChange(false);
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
      // The dialog stays: it now offers every format for the vector code.
      toast.success("Now an Image QR code", {
        description: "Pick SVG, PDF or EPS for it.",
      });
    } catch {
      toast.error("Couldn't turn this image into an Image QR code");
    } finally {
      setBusy(null);
    }
  };

  return (
    <ResponsiveDialog onOpenChange={onOpenChange} open={open}>
      <ResponsiveDialogContent className="max-h-[92dvh] gap-0 overflow-hidden p-0 sm:max-w-[34rem] dark:!border-border">
        <ResponsiveDialogHeader className="flex-row items-start gap-3 px-6 pt-1 pb-0 text-left sm:pt-6">
          <div className="min-w-0 flex-1 space-y-1">
            <ResponsiveDialogTitle>Download AI art</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {AI_ART_DOWNLOAD_REASON}.
            </ResponsiveDialogDescription>
          </div>
          <DialogCloseButton className="-mt-1 -mr-2 hidden sm:inline-flex" />
        </ResponsiveDialogHeader>

        <div className="grid gap-6 overflow-y-auto px-6 py-6 sm:grid-cols-[9rem_1fr]">
          <img
            alt={`AI-generated QR code artwork that encodes ${result.text}`}
            className="mx-auto aspect-square w-full max-w-36 rounded-[14px] border object-cover"
            height={variant.height}
            src={variant.imageUrl}
            width={variant.width}
          />
          <div className="min-w-0 space-y-4">
            <ToggleGroup
              aria-label="Format"
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
                  {variant.width} px
                </span>
              </ToggleGroupItem>
              <ToggleGroupItem
                className="h-16 flex-col gap-0.5 px-2"
                value="print"
              >
                <span className="flex items-center gap-1.5 text-xs font-medium">
                  <Printer className="size-4" />
                  Print PNG
                </span>
                <span className="text-muted-foreground text-[11px] tabular-nums">
                  {ART_PRINT_SIZE} px, checked again
                </span>
              </ToggleGroupItem>
            </ToggleGroup>
            <div className="flex flex-col gap-2">
              <Button disabled={busy !== null} onClick={download}>
                {busy === "download" ? <Spinner /> : <Import />}
                {format === "png" ? "Download PNG" : "Download print PNG"}
              </Button>
              <Button
                disabled={busy !== null}
                onClick={turnIntoImageQR}
                variant="outline"
              >
                {busy === "image-qr" ? <Spinner /> : <Gallery />}
                Use as Image QR
              </Button>
            </div>
          </div>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
