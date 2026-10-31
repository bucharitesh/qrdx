"use client";

import { Check, ChevronDown, Copy, Download, Loader2 } from "lucide-react";
import {
  copyQRCodeToClipboard,
  type DownloadFormat,
  downloadQRCode,
  getQRData,
  type QRCode,
} from "qrdx";
import { type ComponentProps, useState } from "react";
import { cn } from "@/registry/lib/utils";
import { Button } from "@/registry/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/registry/ui/dropdown-menu";

/** qrdx style options: colors, gradients, patterns, logo, template. */
export type QrCodeStyle = Omit<ComponentProps<typeof QRCode>, "value" | "size">;

const FORMAT_HINTS: Record<string, string> = {
  png: "Image for screens and documents",
  svg: "Vector, scales to any size",
  jpg: "Image with a solid background",
  pdf: "Single-page document",
  eps: "Vector for print shops",
};

const VECTOR_FORMATS = new Set<string>(["svg", "eps"]);

export interface QrCodeDownloadProps
  extends Omit<ComponentProps<"div">, "children" | "onError"> {
  /** Text or URL to encode. */
  value: string;
  /** qrdx style options for the exported code. */
  qr?: QrCodeStyle;
  /**
   * Formats in the menu. "pdf" needs the optional `jspdf` package.
   * @default ["png", "svg", "jpg"]
   */
  formats?: DownloadFormat[];
  /**
   * Pixel sizes to choose from. Pass one size to hide the size picker.
   * @default [512, 1024, 2048]
   */
  sizes?: number[];
  /**
   * Size selected when the menu first opens.
   * @default 1024
   */
  defaultSize?: number;
  /**
   * Download file name without extension.
   * @default "qr-code"
   */
  filename?: string;
  /**
   * Show a "Copy image" item that copies a PNG to the clipboard.
   * @default true
   */
  copy?: boolean;
  /**
   * Trigger button label.
   * @default "Download"
   */
  label?: string;
  /**
   * Trigger button variant.
   * @default "outline"
   */
  variant?: ComponentProps<typeof Button>["variant"];
  /** Called after a file is saved or the image is copied. */
  onComplete?: (action: DownloadFormat | "copy") => void;
  /** Called when an export fails. */
  onError?: (error: Error) => void;
}

/** getQRData lays a logo out for 1024px; scale it to the exported size. */
function getFileProps(
  value: string,
  qr: QrCodeStyle | undefined,
  size: number,
) {
  const data = getQRData({ margin: 2, ...qr, value });
  const ratio = size / data.size;
  return {
    ...data,
    size,
    imageSettings: data.imageSettings && {
      ...data.imageSettings,
      width: data.imageSettings.width * ratio,
      height: data.imageSettings.height * ratio,
    },
  };
}

export function QrCodeDownload({
  value,
  qr,
  formats = ["png", "svg", "jpg"],
  sizes = [512, 1024, 2048],
  defaultSize = 1024,
  filename = "qr-code",
  copy = true,
  label = "Download",
  variant = "outline",
  onComplete,
  onError,
  className,
  ...props
}: QrCodeDownloadProps) {
  const [size, setSize] = useState(
    sizes.includes(defaultSize) ? defaultSize : (sizes[0] ?? 1024),
  );
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  async function run(action: DownloadFormat | "copy") {
    setPending(true);
    setDone(false);
    setError("");
    try {
      const file = getFileProps(value, qr, size);
      if (action === "copy") {
        await copyQRCodeToClipboard(file, { width: size, height: size });
        setStatus("Copied the QR code image");
      } else {
        await downloadQRCode(file, {
          format: action,
          size: { width: size, height: size },
          filename: `${filename}.${action}`,
        });
        setStatus(`Downloaded ${filename}.${action}`);
      }
      setDone(true);
      setTimeout(() => setDone(false), 1500);
      onComplete?.(action);
    } catch (cause) {
      const failure =
        cause instanceof Error
          ? cause
          : new Error("Could not export the code.");
      setError(failure.message);
      onError?.(failure);
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className={cn("inline-flex flex-col items-center gap-1.5", className)}
      data-slot="qr-code-download"
      {...props}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button aria-busy={pending} disabled={pending} variant={variant}>
            {pending ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : done ? (
              <Check aria-hidden="true" />
            ) : (
              <Download aria-hidden="true" />
            )}
            {label}
            <ChevronDown aria-hidden="true" className="opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-64">
          <DropdownMenuLabel>Download as</DropdownMenuLabel>
          {formats.map((format) => (
            <DropdownMenuItem key={format} onSelect={() => run(format)}>
              <span className="flex flex-col">
                <span className="font-medium">{format.toUpperCase()}</span>
                <span className="text-muted-foreground text-xs">
                  {FORMAT_HINTS[format]}
                </span>
              </span>
              <DropdownMenuShortcut>
                {VECTOR_FORMATS.has(format) ? "vector" : `${size}px`}
              </DropdownMenuShortcut>
            </DropdownMenuItem>
          ))}
          {sizes.length > 1 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Size</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                onValueChange={(next) => setSize(Number(next))}
                value={String(size)}
              >
                {sizes.map((option) => (
                  <DropdownMenuRadioItem
                    key={option}
                    onSelect={(event) => event.preventDefault()}
                    value={String(option)}
                  >
                    {option} × {option} px
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </>
          ) : null}
          {copy ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => run("copy")}>
                <Copy aria-hidden="true" />
                Copy image
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {error ? (
        <p
          className="max-w-xs text-center text-destructive text-xs"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <p aria-live="polite" className="sr-only">
        {status}
      </p>
    </div>
  );
}
