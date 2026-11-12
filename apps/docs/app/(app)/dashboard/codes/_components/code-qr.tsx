"use client";

import { toast } from "@repo/design-system";
import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { Import as Download } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { downloadQRCode, getQRData, QRCode } from "qrdx";
import { useState } from "react";
import { defaultThemeState } from "@/config/qr";
import { track } from "@/lib/analytics";
import { DEFAULT_QR_LOGO } from "@/lib/constants";
import { styleEngineOptions } from "@/lib/qr-design/engine-options";
import { soundEvent } from "@/lib/sound/emit";
import type { ThemeStyles } from "@/types/theme";

const DOWNLOAD_SIZE = 1024;

/** The files a saved code downloads as; WebP is lossless. */
export type CodeImageFormat = "png" | "webp" | "svg";
const FORMATS: CodeImageFormat[] = ["png", "webp", "svg"];
const FORMAT_LABELS: Record<CodeImageFormat, string> = {
  png: "PNG",
  webp: "WebP",
  svg: "SVG",
};

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
        frame={s.frame}
        logo={s.customLogo ?? DEFAULT_QR_LOGO}
        margin={s.margin}
        templateId={s.templateId}
        value={value}
        {...styleEngineOptions(s)}
      />
    </div>
  );
}

export async function downloadCodeQr(
  code: { slug: string; shortLink: string; style: ThemeStyles | null },
  format: CodeImageFormat,
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
        margin: s.margin,
        level: s.level,
        ...styleEngineOptions(s),
      }),
      level: s.level,
      cornerEyePattern: s.cornerEyePattern,
      cornerEyeDotPattern: s.cornerEyeDotPattern,
      templateId: s.templateId,
      frame: s.frame,
    },
    {
      format,
      size: { width: DOWNLOAD_SIZE, height: DOWNLOAD_SIZE },
      filename: `qrdx-${code.slug}.${format}`,
    },
  );
  soundEvent("download");
  track("qr_downloaded", {
    format,
    source: "dashboard",
    content_type: "dynamic",
  });
}

export function CodeDownloadButtons({
  code,
  className,
}: {
  code: { slug: string; shortLink: string; style: ThemeStyles | null };
  className?: string;
}) {
  const t = useTranslations("app.dashboard.codes.codeQr");
  const [pending, setPending] = useState<CodeImageFormat | null>(null);

  const download = async (format: CodeImageFormat) => {
    setPending(format);
    try {
      await downloadCodeQr(code, format);
    } catch {
      toast.error(t("downloadFailedPleaseTryAgain"));
    } finally {
      setPending(null);
    }
  };

  return (
    <div className={cn("flex gap-2", className)}>
      {FORMATS.map((format) => (
        <Button
          className="flex-1"
          disabled={pending !== null}
          key={format}
          onClick={() => download(format)}
          size="sm"
          variant="outline"
        >
          <Download />
          {FORMAT_LABELS[format]}
        </Button>
      ))}
    </div>
  );
}
