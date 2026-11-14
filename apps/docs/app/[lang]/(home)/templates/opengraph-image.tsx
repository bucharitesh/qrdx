import { ogSize, renderPageOgImage } from "@/app/og/brand";
import { requireLocaleParam } from "@/lib/i18n/static-params";
import { listTemplateDemos } from "@/lib/landing/demo";
import { onDemandParams } from "@/lib/static-params";

export const alt = "QRdx landing page templates for QR codes";
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
    label: "Templates",
    title: "Landing page templates for QR codes",
    description: `${listTemplateDemos().length} free templates with live demos: link in bio, business card, menu, coupon, event and more.`,
  });
}
