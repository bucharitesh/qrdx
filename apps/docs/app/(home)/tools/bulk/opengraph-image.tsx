import { ogSize, renderPageOgImage } from "@/app/og/brand";
import { MAX_BULK_ROWS } from "@/components/sections/tools/bulk-utils";

export const alt = "QRdx bulk QR code generator";
export const size = ogSize;
export const contentType = "image/png";

export default function Image() {
  return renderPageOgImage({
    label: "Tools",
    title: "Bulk QR codes from a CSV file",
    description: `Up to ${MAX_BULK_ROWS.toLocaleString("en-US")} codes as PNG or SVG in one ZIP, made in your browser.`,
  });
}
