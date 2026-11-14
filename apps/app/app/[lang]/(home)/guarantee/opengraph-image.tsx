import { ogSize, renderPageOgImage } from "@/app/og/brand";
import { GUARANTEE_NAME } from "@/components/sections/pricing/guarantee-block";
import { requireLocaleParam } from "@/lib/i18n/static-params";
import { onDemandParams } from "@/lib/static-params";

export const alt = "The QRdx Never-Hostage Guarantee";
export const size = ogSize;
export const contentType = "image/png";

export function generateStaticParams() {
  return onDemandParams();
}

export default async function Image({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  await requireLocaleParam(params);
  return renderPageOgImage({
    label: "Guarantee",
    title: "Your printed QR codes keep working",
    description:
      "Dynamic codes keep redirecting after a downgrade, failed payment or cancellation. No pausing, no ads.",
    footer: GUARANTEE_NAME,
  });
}
