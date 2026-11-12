import { ogSize, renderPageOgImage } from "@/app/og/brand";
import { localeParams, requireLocaleParam } from "@/lib/i18n/static-params";

export const alt = "The QRdx custom QR code designer";
export const size = ogSize;
export const contentType = "image/png";

export function generateStaticParams() {
  return localeParams();
}

export default async function Image({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  await requireLocaleParam(params);
  return renderPageOgImage({
    label: "Designer",
    title: "Design a custom QR code",
    description:
      "Logo, colors, gradients, dot patterns and frames. Download PNG, SVG, PDF or EPS.",
  });
}
