import { ogSize, renderPageOgImage } from "@/app/og/brand";
import { industries } from "@/lib/seo-content";

export const alt = "QR code ideas by industry";
export const size = ogSize;
export const contentType = "image/png";

export default function Image() {
  return renderPageOgImage({
    label: "Industries",
    title: "QR codes by industry",
    description: `Ideas for ${industries.items.length} industries: which code type to use, how big to print and what to write beside the code.`,
    footer: "Free · Open source · qrdx.dev",
  });
}
