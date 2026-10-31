"use client";

import { handleImageLoad } from "qrdx";
import {
  type ChangeEvent,
  type ComponentProps,
  type DragEvent,
  useId,
  useState,
} from "react";

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
  /** Heading inside the drop zone. */
  label?: string;
}

const cx = (...classes: (string | false | null | undefined)[]) =>
  classes.filter(Boolean).join(" ");

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
      className={cx("flex w-full max-w-sm flex-col gap-3", className)}
      {...props}
    >
      <label
        className={cx(
          "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-6 py-8 text-center text-sm transition-colors focus-within:ring-[3px] focus-within:ring-ring/50 hover:bg-accent/50",
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
          <div className="flex flex-col gap-2 rounded-md border p-3">
            <code className="break-all font-mono text-xs">{state.value}</code>
            <div className="flex gap-2">
              <button
                className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 font-medium text-sm shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                onClick={() => copy(state.value)}
                type="button"
              >
                {copied ? "Copied" : "Copy"}
              </button>
              {/^https?:\/\//i.test(state.value) ? (
                <a
                  className="inline-flex h-8 items-center justify-center rounded-md px-3 font-medium text-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  href={state.value}
                  rel="noopener noreferrer nofollow"
                  target="_blank"
                >
                  Open link
                </a>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
