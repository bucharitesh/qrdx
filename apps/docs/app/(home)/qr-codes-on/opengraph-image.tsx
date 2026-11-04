import { ogSize, renderPageOgImage } from "@/app/og/brand";
import { placements } from "@/lib/seo-content";

export const alt = "Where to put a QR code, and how big to print it";
export const size = ogSize;
export const contentType = "image/png";

export default function Image() {
  return renderPageOgImage({
    label: "Placements",
    title: "QR codes by placement",
    description: `Business cards, packaging, menus, billboards, receipts and ${placements.items.length - 5} more placements, with print sizes for each.`,
    footer: "Free · Open source · qrdx.dev",
  });
}
