"use client";

import { toast } from "@repo/design-system";
import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { Download } from "lucide-react";
import { downloadQRCode, getQRData, QRCode } from "qrdx";
import { useState } from "react";
import { defaultThemeState } from "@/config/qr";
import { DEFAULT_QR_LOGO } from "@/lib/constants";
import type { ThemeStyles } from "@/types/theme";

const DOWNLOAD_SIZE = 1024;

const resolveStyle = (style: ThemeStyles | null | undefined): ThemeStyles =>
  style ?? defaultThemeState.styles;

/** The code's saved design rendered with its short link. */
export function CodeQr({
  value,
  style,
  className,
}: {
  value: string;
  style: ThemeStyles | null | undefined;
  className?: string;
}) {
  const s = resolveStyle(style);
  return (
    <div
      className={cn(
        "flex aspect-square items-center justify-center [&_svg]:size-full",
        className,
      )}
    >
      <QRCode
        bgColor={s.bgColor}
        bodyPattern={s.bodyPattern}
        cornerEyeDotPattern={s.cornerEyeDotPattern}
        cornerEyePattern={s.cornerEyePattern}
        dotColor={s.dotColor}
        eyeColor={s.eyeColor}
        fgColor={s.fgColor}
        hideLogo={!s.showLogo}
        level={s.level}
        logo={s.customLogo ?? DEFAULT_QR_LOGO}
        templateId={s.templateId}
        value={value}
      />
    </div>
  );
}

export async function downloadCodeQr(
  code: { slug: string; shortLink: string; style: ThemeStyles | null },
  format: "png" | "svg",
): Promise<void> {
  const s = resolveStyle(code.style);
  await downloadQRCode(
    {
      ...getQRData({
        value: code.shortLink,
        fgColor: s.fgColor,
        bgColor: s.bgColor,
        eyeColor: s.eyeColor,
        dotColor: s.dotColor,
        bodyPattern: s.bodyPattern,
        hideLogo: !s.showLogo,
        logo: s.customLogo ?? DEFAULT_QR_LOGO,
      }),
      level: s.level,
      cornerEyePattern: s.cornerEyePattern,
      cornerEyeDotPattern: s.cornerEyeDotPattern,
      templateId: s.templateId,
    },
    {
      format,
      size: { width: DOWNLOAD_SIZE, height: DOWNLOAD_SIZE },
      filename: `qrdx-${code.slug}.${format}`,
    },
  );
}

export function CodeDownloadButtons({
  code,
  className,
}: {
  code: { slug: string; shortLink: string; style: ThemeStyles | null };
  className?: string;
}) {
  const [pending, setPending] = useState<"png" | "svg" | null>(null);

  const download = async (format: "png" | "svg") => {
    setPending(format);
    try {
      await downloadCodeQr(code, format);
    } catch {
      toast.error("Download failed. Please try again.");
    } finally {
      setPending(null);
    }
  };

  return (
    <div className={cn("flex gap-2", className)}>
      {(["png", "svg"] as const).map((format) => (
        <Button
          className="flex-1"
          disabled={pending !== null}
          key={format}
          onClick={() => download(format)}
          size="sm"
          variant="outline"
        >
          <Download />
          {format.toUpperCase()}
        </Button>
      ))}
    </div>
  );
}
