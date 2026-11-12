"use client";

import { toast } from "@repo/design-system";
import { Spinner as LoaderCircle } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import {
  ClipboardImport as ClipboardPaste,
  GalleryExport as ImageUp,
} from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { type DetectedCode, detectCodesInImage } from "./detector";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_FILES = 20;

/** Images shared to the installed app (components/scanner/shared-images.ts). */
export interface IncomingImages {
  files: File[];
  id: number;
}

export function ImageScan({
  incoming,
  onDetect,
}: {
  incoming?: IncomingImages | null;
  onDetect: (codes: DetectedCode[]) => void;
}) {
  const t = useTranslations("scanner.image");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const busyRef = useRef(false);
  const incomingRef = useRef<number | null>(null);
  const onDetectRef = useRef(onDetect);
  onDetectRef.current = onDetect;

  const scanFiles = useCallback(
    async (files: Blob[]) => {
      const images = files.filter((file) => file.type.startsWith("image/"));
      if (images.length === 0) {
        setMessage(t("notImage"));
        return;
      }
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setMessage(null);
      const found: DetectedCode[] = [];
      let unreadable = 0;
      let empty = 0;
      for (const image of images.slice(0, MAX_FILES)) {
        if (image.size > MAX_IMAGE_BYTES) {
          unreadable++;
          continue;
        }
        try {
          const codes = await detectCodesInImage(image);
          if (codes.length === 0) empty++;
          found.push(...codes);
        } catch (error) {
          console.error("Image scan failed:", error);
          unreadable++;
        }
      }
      busyRef.current = false;
      setBusy(false);
      if (found.length > 0) onDetectRef.current(found);
      const notes = [
        images.length > MAX_FILES && t("firstOnly", { count: MAX_FILES }),
        empty > 0 &&
          (images.length === 1
            ? t("noCode")
            : t("noCodeSome", { count: empty })),
        unreadable > 0 && t("unreadable", { count: unreadable }),
      ].filter(Boolean);
      setMessage(notes.length > 0 ? notes.join(" ") : null);
    },
    [t],
  );

  useEffect(() => {
    if (!incoming || incomingRef.current === incoming.id) return;
    incomingRef.current = incoming.id;
    if (incoming.files.length === 0) {
      setMessage(t("shareMissing"));
      return;
    }
    scanFiles(incoming.files);
  }, [incoming, scanFiles, t]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []).filter(
        (file) => file.type.startsWith("image/"),
      );
      if (files.length > 0) {
        event.preventDefault();
        scanFiles(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [scanFiles]);

  const pasteFromClipboard = async () => {
    try {
      const items = await navigator.clipboard.read();
      const blobs: Blob[] = [];
      for (const item of items) {
        const type = item.types.find((entry) => entry.startsWith("image/"));
        if (type) blobs.push(await item.getType(type));
      }
      if (blobs.length > 0) {
        await scanFiles(blobs);
      } else {
        toast.error(t("noClipboardImage"));
      }
    } catch {
      toast.error(t("clipboardBlocked"));
    }
  };

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: { "image/*": [] },
    multiple: true,
    noClick: true,
    onDrop: (files) => {
      if (files.length > 0) scanFiles(files);
    },
  });

  return (
    <div className="flex flex-col gap-3">
      <div
        {...getRootProps()}
        className={cn(
          "flex min-h-64 flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
          isDragActive ? "border-foreground/30 bg-muted/50" : "border-border",
        )}
      >
        <input {...getInputProps()} aria-label={t("inputLabel")} />
        {busy ? (
          <LoaderCircle
            aria-hidden
            className="text-muted-foreground size-8 animate-spin"
          />
        ) : (
          <ImageUp aria-hidden className="text-muted-foreground size-8" />
        )}
        <div className="space-y-1">
          <p className="font-medium">{busy ? t("reading") : t("drop")}</p>
          <p className="text-muted-foreground text-sm">{t("dropHelp")}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button disabled={busy} onClick={open} type="button">
            <ImageUp className="size-4" />
            {t("choose")}
          </Button>
          <Button
            disabled={busy}
            onClick={pasteFromClipboard}
            type="button"
            variant="outline"
          >
            <ClipboardPaste className="size-4" />
            {t("paste")}
          </Button>
        </div>
      </div>
      {message && (
        <output className="block rounded-md bg-amber-500/10 p-3 text-sm">
          {message}
        </output>
      )}
    </div>
  );
}
