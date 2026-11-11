import { ogSize, renderPageOgImage } from "@/app/og/brand";

export const alt = "The QRdx custom QR code designer";
export const size = ogSize;
export const contentType = "image/png";

export default function Image() {
  return renderPageOgImage({
    label: "Designer",
    title: "Design a custom QR code",
    description:
      "Logo, colors, gradients, dot patterns and frames. Download PNG, SVG, PDF or EPS.",
  });
}
