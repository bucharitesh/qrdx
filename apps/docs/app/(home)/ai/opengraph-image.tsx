import { ogSize, renderPageOgImage } from "@/app/og/brand";
import { AI_REQUEST_FREE_TIER_LIMIT } from "@/lib/constants";

export const alt = "The QRdx AI QR code designer";
export const size = ogSize;
export const contentType = "image/png";

export default function Image() {
  return renderPageOgImage({
    label: "AI",
    title: "Design a QR code from a prompt",
    description:
      "Say what the code should open and how it should look. The AI checks the scan score and repairs the design until it's Great.",
    footer: `Free accounts include ${AI_REQUEST_FREE_TIER_LIMIT} AI requests`,
  });
}
