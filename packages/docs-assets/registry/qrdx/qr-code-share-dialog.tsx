"use client";

import { Check, Copy, Download, Share2 } from "lucide-react";
import { downloadQRCode, getQRData, QRCode } from "qrdx";
import {
  type ComponentProps,
  type ReactNode,
  useEffect,
  useId,
  useState,
} from "react";
import { Button } from "@/registry/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/registry/ui/dialog";
import { Input } from "@/registry/ui/input";

/** qrdx style options: colors, gradients, patterns, logo, template. */
export type QrCodeStyle = Omit<ComponentProps<typeof QRCode>, "value" | "size">;

export interface QrCodeShareDialogProps
  extends Omit<ComponentProps<typeof Dialog>, "children"> {
  /** The link to share. It is encoded in the QR code. */
  url: string;
  /**
   * Dialog title.
   * @default "Share link"
   */
  title?: string;
  /**
   * Text under the title.
   * @default "Anyone with the link or the QR code can open it."
   */
  description?: ReactNode;
  /** Custom trigger element. Defaults to a "Share" button. */
  children?: ReactNode;
  /**
   * Width and height of the code in pixels.
   * @default 200
   */
  size?: number;
  /** qrdx style options for the code. */
  qr?: QrCodeStyle;
  /**
   * File name for the PNG download, without extension.
   * @default "qr-code"
   */
  filename?: string;
}

export function QrCodeShareDialog({
  url,
  title = "Share link",
  description = "Anyone with the link or the QR code can open it.",
  children,
  size = 200,
  qr,
  filename = "qr-code",
  ...props
}: QrCodeShareDialogProps) {
  const inputId = useId();
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && "share" in navigator);
  }, []);

  async function copyLink() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function downloadPng() {
    // getQRData lays a logo out for 1024px, the size of this file.
    await downloadQRCode(getQRData({ margin: 2, ...qr, value: url }), {
      format: "png",
      size: { width: 1024, height: 1024 },
      filename: `${filename}.png`,
    });
  }

  async function share() {
    try {
      await navigator.share({ title, url });
    } catch {
      // Closing the share sheet rejects; nothing to do.
    }
  }

  return (
    <Dialog {...props}>
      <DialogTrigger asChild>
        {children ?? (
          <Button variant="outline">
            <Share2 aria-hidden="true" />
            Share
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex justify-center">
          <div
            aria-label={`QR code: ${url}`}
            className="overflow-hidden rounded-[10px] border"
            role="img"
            style={{ width: size, height: size }}
          >
            <QRCode margin={2} {...qr} size={size} value={url} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor={inputId}>
            Link
          </label>
          <Input
            className="font-mono text-xs"
            id={inputId}
            onClick={(event) => event.currentTarget.select()}
            readOnly
            value={url}
          />
          <Button
            aria-label={copied ? "Link copied" : "Copy link"}
            onClick={copyLink}
            size="icon"
            type="button"
            variant="outline"
          >
            {copied ? (
              <Check aria-hidden="true" />
            ) : (
              <Copy aria-hidden="true" />
            )}
          </Button>
        </div>
        <DialogFooter className="gap-2 sm:justify-center">
          <Button onClick={downloadPng} type="button" variant="outline">
            <Download aria-hidden="true" />
            Download PNG
          </Button>
          {canShare ? (
            <Button onClick={share} type="button">
              <Share2 aria-hidden="true" />
              Share…
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
