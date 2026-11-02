import { ogSize, renderPageOgImage } from "@/app/og/brand";

export const alt = "QRdx QR code print size calculator";
export const size = ogSize;
export const contentType = "image/png";

export default function Image() {
  return renderPageOgImage({
    label: "Tools",
    title: "QR code print size calculator",
    description:
      "The minimum printed size from scan distance, data and error correction, in mm and inches.",
  });
}
