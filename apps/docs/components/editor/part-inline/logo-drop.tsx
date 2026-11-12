"use client";

import { Gallery } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { type RefObject, useEffect, useRef, useState } from "react";
import { useLogoUpload } from "../control-sections/logo-controls";

// Drop an image on the preview to make it the logo. It goes through the
// logo panel's own upload (useLogoUpload: the same types, size limit and
// error toasts); a drag that carries no image is left alone.

/** Whether a drag carries a file that may be an image. */
function carriesImage(event: DragEvent): boolean {
  const transfer = event.dataTransfer;
  if (!transfer?.types.includes("Files")) return false;
  const items = Array.from(transfer.items ?? []);
  // Some browsers don't say what a file is until it's dropped
  if (items.length === 0 || items.every((item) => !item.type)) return true;
  return items.some(
    (item) => item.kind === "file" && item.type.startsWith("image/"),
  );
}

export function LogoDrop({
  rootRef,
  onLogo,
}: {
  /** The preview container the drop covers */
  rootRef: RefObject<HTMLElement | null>;
  /** The dropped image, read and checked, as a data URL */
  onLogo: (dataUrl: string) => void;
}) {
  const t = useTranslations("editor.partInline.drop");
  const [over, setOver] = useState(false);
  const upload = useLogoUpload(onLogo);
  // The latest reader, without re-subscribing mid-drag
  const readFile = useRef(upload.readFile);
  readFile.current = upload.readFile;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    // dragenter and dragleave fire for every child crossed: count them
    let depth = 0;
    const enter = (event: DragEvent) => {
      if (!carriesImage(event)) return;
      event.preventDefault();
      depth += 1;
      setOver(true);
    };
    const over = (event: DragEvent) => {
      if (!carriesImage(event)) return;
      // Allows the drop (and says it copies)
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };
    const leave = (event: DragEvent) => {
      if (!carriesImage(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setOver(false);
    };
    const drop = (event: DragEvent) => {
      if (!carriesImage(event)) return;
      event.preventDefault();
      depth = 0;
      setOver(false);
      const file = event.dataTransfer?.files[0];
      if (file) readFile.current(file);
    };
    // A drag that ends anywhere else (Escape, a drop outside) clears the hint
    const reset = () => {
      depth = 0;
      setOver(false);
    };
    root.addEventListener("dragenter", enter);
    root.addEventListener("dragover", over);
    root.addEventListener("dragleave", leave);
    root.addEventListener("drop", drop);
    window.addEventListener("dragend", reset);
    window.addEventListener("drop", reset);
    return () => {
      root.removeEventListener("dragenter", enter);
      root.removeEventListener("dragover", over);
      root.removeEventListener("dragleave", leave);
      root.removeEventListener("drop", drop);
      window.removeEventListener("dragend", reset);
      window.removeEventListener("drop", reset);
    };
  }, [rootRef]);

  return (
    over && (
      <div
        aria-live="polite"
        className="bg-background/80 text-foreground pointer-events-none absolute inset-3 z-30 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-current/30 text-sm font-medium backdrop-blur-sm"
        data-logo-drop=""
      >
        <Gallery aria-hidden className="size-6" />
        {t("dropToUseAsLogo")}
      </div>
    )
  );
}
