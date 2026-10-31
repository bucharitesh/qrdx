"use client";

import { Check, Copy, ExternalLink, ImageUp, Loader2 } from "lucide-react";
import { handleImageLoad } from "qrdx";
import {
  type ChangeEvent,
  type ComponentProps,
  type DragEvent,
  useId,
  useState,
} from "react";
import { cn } from "@/registry/lib/utils";
import { Button } from "@/registry/ui/button";

type ScanState =
  | { status: "idle" }
  | { status: "scanning" }
  | { status: "found"; value: string }
  | { status: "not-found" }
  | { status: "error"; message: string };

export interface QrCodeScannerProps
  extends Omit<ComponentProps<"div">, "children" | "onDrop"> {
  /** Called with the decoded text when a QR code is found. */
  onResult?: (value: string) => void;
  /**
   * Heading inside the drop zone.
   * @default "Scan a QR code from an image"
   */
  label?: string;
}

/** Decodes the first QR code in an image file, in the browser. */
async function decodeImageFile(file: File): Promise<string | null> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const result = await handleImageLoad(image, image.naturalWidth);
    return typeof result === "string" && result !== "NO_QR" ? result : null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function QrCodeScanner({
  onResult,
  label = "Scan a QR code from an image",
  className,
  ...props
}: QrCodeScannerProps) {
  const inputId = useId();
  const [state, setState] = useState<ScanState>({ status: "idle" });
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState(false);

  async function scan(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setState({ status: "error", message: "Choose an image file." });
      return;
    }
    setState({ status: "scanning" });
    setCopied(false);
    try {
      const value = await decodeImageFile(file);
      if (value === null) {
        setState({ status: "not-found" });
        return;
      }
      setState({ status: "found", value });
      onResult?.(value);
    } catch {
      setState({ status: "error", message: "Could not read that image." });
    }
  }

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    scan(event.target.files?.[0]);
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    scan(event.dataTransfer.files[0]);
  }

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(true);
  }

  return (
    <div
      className={cn("flex w-full max-w-sm flex-col gap-3", className)}
      data-slot="qr-code-scanner"
      {...props}
    >
      <label
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-8 text-center text-sm transition-colors focus-within:ring-[3px] focus-within:ring-ring/50 hover:bg-accent/50",
          dragging && "border-primary bg-accent/50",
        )}
        htmlFor={inputId}
        onDragLeave={() => setDragging(false)}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDrop={onDrop}
      >
        <span className="flex size-10 items-center justify-center rounded-full border bg-background">
          {state.status === "scanning" ? (
            <Loader2
              aria-hidden="true"
              className="size-4 animate-spin text-muted-foreground"
            />
          ) : (
            <ImageUp
              aria-hidden="true"
              className="size-4 text-muted-foreground"
            />
          )}
        </span>
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground text-xs">
          Drop an image here or click to choose one. It never leaves your
          device.
        </span>
        <input
          accept="image/*"
          className="sr-only"
          id={inputId}
          onChange={onChange}
          type="file"
        />
      </label>

      <div aria-live="polite" className="min-h-5 text-sm">
        {state.status === "scanning" ? (
          <p className="text-muted-foreground">Scanning…</p>
        ) : null}
        {state.status === "not-found" ? (
          <p className="text-muted-foreground">
            No QR code found. Try a sharper or closer image.
          </p>
        ) : null}
        {state.status === "error" ? (
          <p className="text-destructive">{state.message}</p>
        ) : null}
        {state.status === "found" ? (
          <div className="flex flex-col gap-3 rounded-lg border p-3">
            <code className="break-all font-mono text-xs">{state.value}</code>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => copy(state.value)}
                size="sm"
                type="button"
                variant="outline"
              >
                {copied ? (
                  <Check aria-hidden="true" />
                ) : (
                  <Copy aria-hidden="true" />
                )}
                {copied ? "Copied" : "Copy"}
              </Button>
              {/^https?:\/\//i.test(state.value) ? (
                <Button asChild size="sm" variant="ghost">
                  <a
                    href={state.value}
                    rel="noopener noreferrer nofollow"
                    target="_blank"
                  >
                    <ExternalLink aria-hidden="true" />
                    Open link
                  </a>
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
