// The public image API URL of a barcode (GET /api/v1/barcode), with only the
// parameters that differ from the format's defaults. Pure and client-safe.
import type { BarcodeFileType } from "./files";
import type { BarcodeFormatId } from "./formats";
import { type BarcodeStyle, styleChanges } from "./style";

const PARAM: Record<keyof BarcodeStyle, string> = {
  foreground: "fg",
  background: "bg",
  showText: "text",
  barHeightMm: "height",
  quietZone: "quietZone",
  scale: "scale",
  rotation: "rotate",
};

export function barcodeImageUrl(
  origin: string | URL,
  format: BarcodeFormatId,
  value: string,
  style: BarcodeStyle,
  type: BarcodeFileType = "svg",
): string {
  const url = new URL("/api/v1/barcode", origin);
  url.searchParams.set("format", format);
  url.searchParams.set("data", value);
  if (type !== "svg") url.searchParams.set("type", type);
  for (const [key, changed] of Object.entries(styleChanges(format, style)) as [
    keyof BarcodeStyle,
    unknown,
  ][]) {
    url.searchParams.set(
      PARAM[key],
      typeof changed === "string" ? changed.replace(/^#/, "") : String(changed),
    );
  }
  return url.toString();
}
