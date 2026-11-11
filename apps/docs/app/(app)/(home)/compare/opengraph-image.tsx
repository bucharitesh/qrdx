import { ogSize, renderPageOgImage } from "@/app/og/brand";

export const alt = "QRdx compared with other QR code tools";
export const size = ogSize;
export const contentType = "image/png";

export default function Image() {
  return renderPageOgImage({
    label: "Compare",
    title: "QRdx vs other QR code generators and libraries",
    description:
      "Pricing, free limits and when each is the better pick, with the sources checked.",
  });
}
