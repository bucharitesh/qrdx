import { ogSize, renderPageOgImage } from "@/app/og/brand";

export const alt = "QRdx online QR code and barcode scanner";
export const size = ogSize;
export const contentType = "image/png";

export default function Image() {
  return renderPageOgImage({
    label: "Scanner",
    title: "Scan QR codes and barcodes online",
    description:
      "Use your camera or an image, and see where a link goes before it opens.",
    footer: "Free · No app · No signup",
  });
}
