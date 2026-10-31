"use client";

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

export interface QrCodeProps
  extends Omit<ComponentProps<"figure">, "children"> {
  /** Text or URL to encode. */
  value: string;
  /** Rendered width and height in pixels. */
  size?: number;
  /** Module color: a CSS color or a qrdx gradient. */
  fgColor?: ColorConfig;
  bgColor?: ColorConfig;
  /** Corner eye color. Defaults to fgColor. */
  eyeColor?: ColorConfig;
  /** Color of the dot inside each corner eye. Defaults to fgColor. */
  dotColor?: ColorConfig;
  bodyPattern?: BodyPattern;
  cornerEyePattern?: CornerEyePattern;
  cornerEyeDotPattern?: CornerEyeDotPattern;
  /** Error correction level. Use "H" with a logo. */
  level?: ErrorLevel;
  /** Quiet zone around the code, in modules. */
  margin?: number;
  /** qrdx frame template id, e.g. "Arrow". */
  templateId?: string;
  /** Center logo: a data URL or an image URL served with CORS headers. */
  logo?: string;
  /** Accessible name. Defaults to "QR code: <value>". */
  label?: string;
  /** Optional visible caption under the code. */
  caption?: ReactNode;
  /** Download buttons to show. Pass [] to hide them. "pdf" needs jspdf. */
  downloadFormats?: DownloadFormat[];
  /** Width and height of downloaded files in pixels (50-5000). */
  downloadSize?: number;
  /** Download file name without extension. */
  filename?: string;
}

const cx = (...classes: (string | false | null | undefined)[]) =>
  classes.filter(Boolean).join(" ");

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
    try {
      // getQRData lays the logo out on its own canvas; scale it to the file.
      const data = getQRData({ ...style, value, logo });
      const scale = downloadSize / data.size;
      await downloadQRCode(
        {
          ...data,
          imageSettings: data.imageSettings && {
            ...data.imageSettings,
            width: data.imageSettings.width * scale,
            height: data.imageSettings.height * scale,
          },
        },
        {
          format,
          size: { width: downloadSize, height: downloadSize },
          filename: `${filename}.${format}`,
        },
      );
      setStatus(`Downloaded ${filename}.${format}`);
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not download the file",
      );
    } finally {
      setPending(null);
    }
  }

  return (
    <figure
      className={cx("inline-flex flex-col items-center gap-3", className)}
      {...props}
    >
      <div
        aria-label={label ?? `QR code: ${value}`}
        className="overflow-hidden rounded-md"
        role="img"
        style={{ width: size, height: size }}
      >
        <QRCodeImage {...style} logo={logo} size={size} value={value} />
      </div>
      {caption ? (
        <figcaption className="text-muted-foreground text-sm">
          {caption}
        </figcaption>
      ) : null}
      {downloadFormats.length > 0 ? (
        <fieldset className="flex flex-wrap justify-center gap-2">
          <legend className="sr-only">Download QR code</legend>
          {downloadFormats.map((format) => (
            <button
              aria-busy={pending === format}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 font-medium text-sm shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
              disabled={pending !== null}
              key={format}
              onClick={() => download(format)}
              type="button"
            >
              <svg
                aria-hidden="true"
                className="size-4"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path d="M12 15V3" />
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <path d="m7 10 5 5 5-5" />
              </svg>
              {format.toUpperCase()}
            </button>
          ))}
        </fieldset>
      ) : null}
      <p aria-live="polite" className="sr-only">
        {status}
      </p>
    </figure>
  );
}
