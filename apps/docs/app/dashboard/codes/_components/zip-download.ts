import { strToU8 } from "fflate";
import Papa from "papaparse";
import { getQRCodeDataUrl, getQRData } from "qrdx";
import {
  createFilenameAllocator,
  dataUrlToBytes,
  imageToDataUrl,
  sanitizeFilename,
} from "@/components/sections/tools/bulk-utils";
import { defaultThemeState } from "@/config/qr";
import { DEFAULT_QR_LOGO } from "@/lib/constants";
import { styleEngineOptions } from "@/lib/qr-design/engine-options";
import { soundEvent } from "@/lib/sound/emit";
import { createZipStream, saveBlob } from "@/lib/zip-stream";
import type { ThemeStyles } from "@/types/theme";

const SIZE = 1024;
const BATCH = 6;

/** Image files a ZIP of codes can hold (WebP is lossless). */
export type ZipFormat = "png" | "webp" | "svg";

export const ZIP_FORMAT_LABELS: Record<ZipFormat, string> = {
  png: "PNG",
  webp: "WebP",
  svg: "SVG",
};

interface ZipCode {
  slug: string;
  shortLink: string;
  title: string | null;
  destinationUrl: string;
  style: ThemeStyles | null;
}

/** Loads each logo once (as a data URL, so SVG files keep it when opened alone). */
export function createLogoCache() {
  const logos = new Map<string, Promise<string | null>>();
  return (src: string) => {
    let logo = logos.get(src);
    if (!logo) {
      logo = imageToDataUrl(src).catch(() => null);
      logos.set(src, logo);
    }
    return logo;
  };
}

/** A code's image with its saved design, as the single download makes it; null if it fails. */
export async function renderCodeImage(
  code: Pick<ZipCode, "shortLink" | "style">,
  format: "png" | "svg",
  logoFor: (src: string) => Promise<string | null>,
): Promise<Uint8Array | null> {
  const s = code.style ?? defaultThemeState.styles;
  const logo = s.showLogo
    ? await logoFor(s.customLogo ?? DEFAULT_QR_LOGO)
    : null;
  try {
    const dataUrl = await getQRCodeDataUrl(
      {
        ...getQRData({
          value: code.shortLink,
          fgColor: s.fgColor,
          bgColor: s.bgColor,
          eyeColor: s.eyeColor,
          dotColor: s.dotColor,
          bodyPattern: s.bodyPattern,
          hideLogo: !(s.showLogo && logo),
          logo: logo ?? undefined,
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
      format,
      { width: SIZE, height: SIZE },
    );
    return dataUrlToBytes(dataUrl);
  } catch {
    return null;
  }
}

/**
 * Renders each code with its saved design (as the single download does) and
 * saves one ZIP, with a codes.csv index. Runs in the browser; the archive is
 * streamed (lib/zip-stream.ts), so large selections don't pile up in memory.
 */
export async function downloadCodesZip(
  codes: ZipCode[],
  format: ZipFormat,
  onProgress?: (done: number, total: number) => void,
): Promise<{ saved: number; failed: number }> {
  const logoFor = createLogoCache();
  const allocate = createFilenameAllocator();
  const zip = createZipStream();
  const index: Record<string, string>[] = [];
  let failed = 0;

  for (let start = 0; start < codes.length; start += BATCH) {
    const batch = codes.slice(start, start + BATCH);
    const outputs = await Promise.all(
      batch.map(async (code) => ({
        code,
        bytes: await renderCodeImage(code, format, logoFor),
      })),
    );

    for (const { code, bytes } of outputs) {
      if (!bytes) {
        failed++;
        continue;
      }
      const name = allocate(
        sanitizeFilename(code.title ?? "") || `qrdx-${code.slug}`,
        format,
      );
      // PNG and WebP are already compressed; SVG text shrinks a lot.
      zip.add(name, bytes, format === "svg");
      index.push({
        file: name,
        title: code.title ?? "",
        short_link: code.shortLink,
        destination: code.destinationUrl,
      });
    }
    onProgress?.(Math.min(start + BATCH, codes.length), codes.length);
    // Let the browser paint progress between batches.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  if (index.length === 0) {
    zip.abort();
    return { saved: 0, failed };
  }
  zip.add("codes.csv", strToU8(Papa.unparse(index)), true);
  saveBlob(await zip.finish(), `qrdx-codes-${format}.zip`);
  soundEvent("download");
  return { saved: index.length, failed };
}
