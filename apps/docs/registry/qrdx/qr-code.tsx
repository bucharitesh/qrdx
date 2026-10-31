"use client";

import { Download } from "lucide-react";
import {
  type BodyPattern,
  type ColorConfig,
  type CornerEyeDotPattern,
  type CornerEyePattern,
  type DownloadFormat,
  downloadQRCode,
  type ErrorLevel,
  getQRData,
  QRCode as QRCodeImage,
} from "qrdx";
import { type ComponentProps, type ReactNode, useState } from "react";
import { cn } from "@/registry/lib/utils";
import { Button } from "@/registry/ui/button";

export interface QrCodeProps
  extends Omit<ComponentProps<"figure">, "children"> {
  /** Text or URL to encode. */
  value: string;
  /**
   * Rendered width and height in pixels.
   * @default 200
   */
  size?: number;
  /**
   * Module color: any CSS color or a qrdx gradient.
   * @default "#000000"
   */
  fgColor?: ColorConfig;
  /**
   * Background color: any CSS color or a qrdx gradient.
   * @default "#FFFFFF"
   */
  bgColor?: ColorConfig;
  /** Corner eye color. Defaults to `fgColor`. */
  eyeColor?: ColorConfig;
  /** Color of the dot inside each corner eye. Defaults to `fgColor`. */
  dotColor?: ColorConfig;
  /**
   * Shape of the data modules.
   * @default "circle"
   */
  bodyPattern?: BodyPattern;
  /**
   * Shape of the corner eye frames.
   * @default "gear"
   */
  cornerEyePattern?: CornerEyePattern;
  /**
   * Shape of the dot inside each corner eye.
   * @default "circle"
   */
  cornerEyeDotPattern?: CornerEyeDotPattern;
  /**
   * Error correction level. Use "H" with a logo.
   * @default "Q"
   */
  level?: ErrorLevel;
  /**
   * Quiet zone around the code, in modules.
   * @default 2
   */
  margin?: number;
  /** qrdx frame template id, e.g. "Arrow" or "StandardBox". */
  templateId?: string;
  /** Center logo: a data URL or an image URL served with CORS headers. */
  logo?: string;
  /** Accessible name. Defaults to "QR code: <value>". */
  label?: string;
  /** Visible caption under the code. */
  caption?: ReactNode;
  /**
   * Download buttons to show. Pass `[]` to hide them. "pdf" needs the
   * optional `jspdf` package.
   * @default ["png", "svg"]
   */
  downloadFormats?: DownloadFormat[];
  /**
   * Width and height of downloaded files in pixels (50 to 5000).
   * @default 1024
   */
  downloadSize?: number;
  /**
   * Download file name without extension.
   * @default "qr-code"
   */
  filename?: string;
}

export function QrCode({
  value,
  size = 200,
  fgColor,
  bgColor,
  eyeColor,
  dotColor,
  bodyPattern,
  cornerEyePattern,
  cornerEyeDotPattern,
  level,
  margin = 2,
  templateId,
  logo,
  label,
  caption,
  downloadFormats = ["png", "svg"],
  downloadSize = 1024,
  filename = "qr-code",
  className,
  ...props
}: QrCodeProps) {
  const [pending, setPending] = useState<DownloadFormat | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const style = {
    fgColor,
    bgColor,
    eyeColor,
    dotColor,
    bodyPattern,
    cornerEyePattern,
    cornerEyeDotPattern,
    level,
    margin,
    templateId,
  };

  async function download(format: DownloadFormat) {
    setPending(format);
    setStatus("");
    setError("");
    try {
      // getQRData lays the logo out for 1024px; scale it to the file size.
      const data = getQRData({ ...style, value, logo });
      const ratio = downloadSize / data.size;
      await downloadQRCode(
        {
          ...data,
          size: downloadSize,
          imageSettings: data.imageSettings && {
            ...data.imageSettings,
            width: data.imageSettings.width * ratio,
            height: data.imageSettings.height * ratio,
          },
        },
        {
          format,
          size: { width: downloadSize, height: downloadSize },
          filename: `${filename}.${format}`,
        },
      );
      setStatus(`Downloaded ${filename}.${format}`);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not download the file.",
      );
    } finally {
      setPending(null);
    }
  }

  return (
    <figure
      className={cn("inline-flex flex-col items-center gap-3", className)}
      data-slot="qr-code"
      {...props}
    >
      <div
        aria-label={label ?? `QR code: ${value}`}
        className="overflow-hidden rounded-[10px]"
        role="img"
        style={{ width: size, height: size }}
      >
        <QRCodeImage {...style} logo={logo} size={size} value={value} />
      </div>
      {caption ? (
        <figcaption className="text-center text-muted-foreground text-sm">
          {caption}
        </figcaption>
      ) : null}
      {downloadFormats.length > 0 ? (
        <fieldset className="flex flex-wrap justify-center gap-2">
          <legend className="sr-only">Download QR code</legend>
          {downloadFormats.map((format) => (
            <Button
              aria-busy={pending === format}
              disabled={pending !== null}
              key={format}
              onClick={() => download(format)}
              size="sm"
              type="button"
              variant="outline"
            >
              <Download aria-hidden="true" />
              {format.toUpperCase()}
            </Button>
          ))}
        </fieldset>
      ) : null}
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
    </figure>
  );
}
