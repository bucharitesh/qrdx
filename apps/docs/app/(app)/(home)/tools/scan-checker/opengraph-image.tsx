import { ogSize, renderPageOgImage } from "@/app/og/brand";

export const alt = "QRdx QR code scan checker";
export const size = ogSize;
export const contentType = "image/png";

export default function Image() {
  return renderPageOgImage({
    label: "Tools",
    title: "Will your QR code scan?",
    description:
      "Test a QR code image at small sizes, with blur and low contrast. Runs in your browser.",
  });
}
