import { ogSize, renderPageOgImage } from "@/app/og/brand";
import { GUARANTEE_NAME } from "@/components/sections/pricing/guarantee-block";

export const alt = "The QRdx Never-Hostage Guarantee";
export const size = ogSize;
export const contentType = "image/png";

export default function Image() {
  return renderPageOgImage({
    label: "Guarantee",
    title: "Your printed QR codes keep working",
    description:
      "Dynamic codes keep redirecting after a downgrade, failed payment or cancellation. No pausing, no ads.",
    footer: GUARANTEE_NAME,
  });
}
