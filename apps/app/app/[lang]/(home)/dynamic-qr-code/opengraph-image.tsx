import { ogSize, renderPageOgImage } from "@repo/design-system/og/brand";
import { requireLocaleParam } from "@/lib/i18n/static-params";
import { getPlanLimits } from "@/lib/plans";
import { onDemandParams } from "@/lib/static-params";

export const alt = "The free QRdx dynamic QR code generator";
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
  const free = getPlanLimits("free");
  return renderPageOgImage({
    label: "Dynamic QR codes",
    title: "Free dynamic QR code generator",
    description:
      "Change where a printed QR code points and see every scan, with no trial period.",
    footer: `${free.dynamicCodes} codes free · Unlimited scans · Keeps working on every plan`,
  });
}
