import { ogSize, renderPageOgImage } from "@/app/og/brand";
import { GUARANTEE_NAME } from "@/components/sections/pricing/guarantee-block";
import { formatPrice, PRICING } from "@/lib/pricing";

export const alt = "QRdx pricing: Free, Pro and Business plans";
export const size = ogSize;
export const contentType = "image/png";

export default function Image() {
  return renderPageOgImage({
    label: "Pricing",
    title: "Free, Pro and Business plans",
    description: `Static QR codes are free forever. Pro is ${formatPrice(PRICING.pro.month.amounts.USD, "USD")}/mo and Business ${formatPrice(PRICING.business.month.amounts.USD, "USD")}/mo.`,
    footer: GUARANTEE_NAME,
  });
}
