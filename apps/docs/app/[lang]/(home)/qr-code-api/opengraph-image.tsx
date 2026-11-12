import { ogSize, renderPageOgImage } from "@/app/og/brand";
import { localeParams, requireLocaleParam } from "@/lib/i18n/static-params";
import { PRODUCT_FACTS } from "@/lib/product-facts";

export const alt = "The free QRdx QR code API";
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
    label: "Developers",
    title: "Free QR code API",
    description:
      "One URL returns a styled QR code as SVG, PNG, WebP or EPS, with your colors and a logo.",
    footer: `No key · ${PRODUCT_FACTS.imageApiPerMinute} requests a minute · Open source`,
  });
}
