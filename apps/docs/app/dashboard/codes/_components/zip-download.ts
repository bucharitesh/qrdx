import { strToU8, type Zippable, zipSync } from "fflate";
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
import type { ThemeStyles } from "@/types/theme";

const SIZE = 1024;
const BATCH = 6;

interface ZipCode {
  slug: string;
  shortLink: string;
  title: string | null;
  destinationUrl: string;
  style: ThemeStyles | null;
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Renders each code with its saved design (as the single download does) and
 * saves one ZIP, with a codes.csv index. Runs in the browser.
 */
export async function downloadCodesZip(
  codes: ZipCode[],
  format: "png" | "svg",
  onProgress?: (done: number, total: number) => void,
): Promise<{ saved: number; failed: number }> {
  const logos = new Map<string, Promise<string | null>>();
  const logoFor = (src: string) => {
    let logo = logos.get(src);
    if (!logo) {
      // Embedded as data URLs so SVG files keep their logo when opened alone.
      logo = imageToDataUrl(src).catch(() => null);
      logos.set(src, logo);
    }
    return logo;
  };

  const allocate = createFilenameAllocator();
  const files: Zippable = {};
  const index: Record<string, string>[] = [];
  let failed = 0;

  for (let start = 0; start < codes.length; start += BATCH) {
    const batch = codes.slice(start, start + BATCH);
    const outputs = await Promise.all(
      batch.map(async (code) => {
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
          return { code, bytes: dataUrlToBytes(dataUrl) };
        } catch {
          return { code, bytes: null };
        }
      }),
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
      // PNGs are already compressed; SVG text shrinks a lot.
      files[name] = [bytes, { level: format === "svg" ? 6 : 0 }];
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

  if (index.length === 0) return { saved: 0, failed };
  files["codes.csv"] = [strToU8(Papa.unparse(index)), { level: 6 }];
  const zipped = zipSync(files);
  saveBlob(
    new Blob([zipped as Uint8Array<ArrayBuffer>], { type: "application/zip" }),
    `qrdx-codes-${format}.zip`,
  );
  return { saved: index.length, failed };
}
