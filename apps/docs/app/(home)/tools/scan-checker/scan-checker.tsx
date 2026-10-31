"use client";

import { toast } from "@repo/design-system";
import { Spinner as LoaderCircle } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import {
  ClipboardImport as ClipboardPaste,
  Copy,
  ExportSquare as ExternalLink,
  GalleryExport as ImageUp,
  ShieldTick as ShieldCheck,
} from "iconsax-reactjs";
import { getImageScanScore, type ImageScanScoreResult } from "qrdx";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  GRADE_COLORS,
  GRADE_LABELS,
  ScanCheckList,
} from "@/components/editor/scan-score";
import { InfoHint } from "@/components/help/info-hint";
import { soundEvent } from "@/lib/sound/emit";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

type Status =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "done"; result: ImageScanScoreResult }
  | { phase: "error"; message: string };

function safeLink(data: string): string | null {
  try {
    const url = new URL(data);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function ScanChecker() {
  const [status, setStatus] = useState<Status>({ phase: "idle" });
  const [preview, setPreview] = useState<string | null>(null);
  const previewRef = useRef<string | null>(null);
  const runRef = useRef(0);

  const check = useCallback(async (file: Blob) => {
    if (!file.type.startsWith("image/")) {
      setStatus({
        phase: "error",
        message: "That isn't an image. Use a PNG, JPG, WebP or GIF.",
      });
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setStatus({
        phase: "error",
        message: "That image is over 20 MB. Use a smaller one.",
      });
      return;
    }
    const run = ++runRef.current;
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current);
    }
    previewRef.current = URL.createObjectURL(file);
    setPreview(previewRef.current);
    setStatus({ phase: "checking" });
    try {
      const result = await getImageScanScore(file);
      if (run === runRef.current) {
        setStatus({ phase: "done", result });
        soundEvent(result.score >= 75 ? "good" : "low");
      }
    } catch (error) {
      console.error("Scan check failed:", error);
      if (run === runRef.current) {
        setStatus({
          phase: "error",
          message: "Couldn't read this image. Try a PNG or JPG.",
        });
      }
    }
  }, []);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files ?? []).find((item) =>
        item.type.startsWith("image/"),
      );
      if (file) {
        event.preventDefault();
        check(file);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [check]);

  useEffect(
    () => () => {
      if (previewRef.current) {
        URL.revokeObjectURL(previewRef.current);
      }
    },
    [],
  );

  const pasteFromClipboard = async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((entry) => entry.startsWith("image/"));
        if (type) {
          await check(await item.getType(type));
          return;
        }
      }
      toast.error("No image on the clipboard");
    } catch {
      toast.error("Clipboard access was blocked. Press Ctrl+V or ⌘V instead.");
    }
  };

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: { "image/*": [] },
    multiple: false,
    noClick: true,
    onDrop: (files) => {
      const [file] = files;
      if (file) {
        check(file);
      }
    },
  });

  const result = status.phase === "done" ? status.result : null;
  const link = result?.data ? safeLink(result.data) : null;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div
        {...getRootProps()}
        className={cn(
          "flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
          isDragActive ? "border-foreground/30 bg-muted/50" : "border-border",
        )}
      >
        <input {...getInputProps()} aria-label="QR code image" />
        <ImageUp aria-hidden className="text-muted-foreground size-8" />
        <div className="space-y-1">
          <p className="font-medium">
            Drop a QR code image here, choose a file or paste it{" "}
            <InfoHint id="scan-checker" />
          </p>
          <p className="text-muted-foreground text-sm">
            Screenshots and photos work. Press Ctrl+V or ⌘V to paste.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={open} type="button">
            <ImageUp className="size-4" />
            Choose image
          </Button>
          <Button onClick={pasteFromClipboard} type="button" variant="outline">
            <ClipboardPaste className="size-4" />
            Paste image
          </Button>
        </div>
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <ShieldCheck aria-hidden className="size-3.5" />
          Checked in your browser. The image is never uploaded.
        </p>
      </div>

      {status.phase === "error" && (
        <div
          className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200"
          role="alert"
        >
          {status.message}
        </div>
      )}

      {preview && status.phase !== "error" && (
        <div className="grid gap-6 rounded-xl border p-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:p-6">
          <div className="bg-muted/40 flex items-center justify-center rounded-lg p-3">
            <img
              alt="Uploaded QR code"
              className="max-h-80 w-auto object-contain"
              src={preview}
            />
          </div>

          <div aria-live="polite" className="flex min-w-0 flex-col gap-4">
            {status.phase === "checking" && (
              <p className="text-muted-foreground flex items-center gap-2 text-sm">
                <LoaderCircle className="size-4 animate-spin" />
                Decoding and testing…
              </p>
            )}

            {result && (
              <>
                <div className="flex items-center gap-3">
                  <span className="text-4xl font-semibold tabular-nums tracking-tight">
                    {result.score}
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium">
                    <span
                      className={cn(
                        "size-2 rounded-full",
                        GRADE_COLORS[result.grade],
                      )}
                    />
                    {GRADE_LABELS[result.grade]}
                  </span>
                </div>

                {result.data !== null ? (
                  <div className="space-y-2">
                    <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                      Decoded content
                      {result.version ? ` · version ${result.version}` : ""}
                    </p>
                    <p className="bg-muted/50 max-h-40 overflow-auto rounded-md p-3 font-mono text-sm break-all whitespace-pre-wrap">
                      {result.data}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(
                              result.data ?? "",
                            );
                            toast.success("Copied");
                            soundEvent("copy");
                          } catch {
                            toast.error("Couldn't copy");
                          }
                        }}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <Copy className="size-3.5" />
                        Copy
                      </Button>
                      {link && (
                        <Button asChild size="sm" variant="outline">
                          <a
                            href={link}
                            rel="noopener noreferrer nofollow"
                            target="_blank"
                          >
                            <ExternalLink className="size-3.5" />
                            Open link
                          </a>
                        </Button>
                      )}
                    </div>
                    {link && (
                      <p className="text-muted-foreground text-xs">
                        Check the address before you open it: QR codes can point
                        anywhere.
                      </p>
                    )}
                  </div>
                ) : null}

                <ScanCheckList checks={result.checks} />

                <p className="text-muted-foreground border-t pt-3 text-xs leading-relaxed">
                  Tested with the open-source jsQR decoder. Phone camera apps
                  are often more forgiving, so treat a low score as a warning
                  and test-scan before printing.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
