import { ogSize, renderPageOgImage } from "@/app/og/brand";
import { COMMUNITY_LICENSE_NAME } from "@/lib/community/licence";

export const alt = "QR code frames and themes from the QRdx community";
export const size = ogSize;
export const contentType = "image/png";

// The /community social image (page.tsx passes `ownOgImage: true`).
export default function Image() {
  return renderPageOgImage({
    label: "Community",
    title: "QR code frames and themes",
    description:
      "Shared by QRdx and its users. Every one scans, and you can open any of them in the QR code generator.",
    footer: `Free under ${COMMUNITY_LICENSE_NAME} · Open in the editor`,
  });
}
