import { ogSize, renderPageOgImage } from "@/app/og/brand";

export const alt = "Free QR code tools from QRdx";
export const size = ogSize;
export const contentType = "image/png";

export default function Image() {
  return renderPageOgImage({
    label: "Tools",
    title: "Free QR code tools",
    description:
      "A bulk generator from CSV, a scan checker, a print size calculator, Wi-Fi and vCard generators and a QR image API.",
  });
}
