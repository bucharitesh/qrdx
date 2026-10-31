"use client";

import { toast } from "@repo/design-system";
import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { ClipboardPaste, ImageUp, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { type DetectedCode, detectCodesInImage } from "./detector";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_FILES = 20;

export function ImageScan({
  onDetect,
}: {
  onDetect: (codes: DetectedCode[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const busyRef = useRef(false);
  const onDetectRef = useRef(onDetect);
  onDetectRef.current = onDetect;

  const scanFiles = useCallback(async (files: Blob[]) => {
    const images = files.filter((file) => file.type.startsWith("image/"));
    if (images.length === 0) {
      setMessage("That isn't an image. Use a PNG, JPG, WebP or GIF.");
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
      images.length > MAX_FILES &&
        `Only the first ${MAX_FILES} images were scanned.`,
      empty > 0 &&
        (images.length === 1
          ? "No code found in this image. Try a sharper, closer picture with the whole code in view."
          : `No code found in ${empty} of the images.`),
      unreadable > 0 &&
        `${unreadable === 1 ? "One image" : `${unreadable} images`} couldn't be read (too large over 20 MB, or not a supported format).`,
    ].filter(Boolean);
    setMessage(notes.length > 0 ? notes.join(" ") : null);
  }, []);

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
        toast.error("No image on the clipboard");
      }
    } catch {
      toast.error("Clipboard access was blocked. Press Ctrl+V or ⌘V instead.");
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
          isDragActive ? "border-primary bg-primary/5" : "border-border",
        )}
      >
        <input
          {...getInputProps()}
          aria-label="Images with QR codes or barcodes"
        />
        {busy ? (
          <LoaderCircle
            aria-hidden
            className="text-muted-foreground size-8 animate-spin"
          />
        ) : (
          <ImageUp aria-hidden className="text-muted-foreground size-8" />
        )}
        <div className="space-y-1">
          <p className="font-medium">
            {busy
              ? "Reading codes…"
              : "Drop images here, choose files or paste"}
          </p>
          <p className="text-muted-foreground text-sm">
            Screenshots and photos work, with several codes per image.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button disabled={busy} onClick={open} type="button">
            <ImageUp className="size-4" />
            Choose images
          </Button>
          <Button
            disabled={busy}
            onClick={pasteFromClipboard}
            type="button"
            variant="outline"
          >
            <ClipboardPaste className="size-4" />
            Paste image
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
