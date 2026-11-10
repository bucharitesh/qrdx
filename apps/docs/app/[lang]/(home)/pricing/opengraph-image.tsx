import { ogSize, renderPageOgImage } from "@/app/og/brand";
import { GUARANTEE_NAME } from "@/components/sections/pricing/guarantee-block";
import { LOCALE_SEGMENTS } from "@/lib/i18n/config";
import { formatPrice, PRICING } from "@/lib/pricing";
import { buildTimeParams } from "@/lib/static-params";

export const alt = "QRdx pricing: Free, Pro and Business plans";
export const size = ogSize;
export const contentType = "image/png";

// One image per language, prerendered (the page itself reads the request).
// The image is in English for now.
export function generateStaticParams() {
  return buildTimeParams(() =>
    LOCALE_SEGMENTS.map((segment) => ({ lang: segment })),
  );
}

export default function Image() {
  return renderPageOgImage({
    label: "Pricing",
    title: "Free, Pro and Business plans",
    description: `Static QR codes are free forever. Pro is ${formatPrice(PRICING.pro.month.amounts.USD, "USD")}/mo and Business ${formatPrice(PRICING.business.month.amounts.USD, "USD")}/mo.`,
    footer: GUARANTEE_NAME,
  });
}
