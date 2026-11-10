import { ogSize, renderPageOgImage } from "@/app/og/brand";
import { QR_TYPES } from "@/lib/qr-types-content";

export const alt = "Every QR code type QRdx makes";
export const size = ogSize;
export const contentType = "image/png";

export default function Image() {
  return renderPageOgImage({
    label: "QR code types",
    title: `${QR_TYPES.length} QR code types, each with a free generator`,
    description:
      "Wi-Fi, vCard, WhatsApp, UPI, email, social profiles and payments, with each payload format.",
  });
}
