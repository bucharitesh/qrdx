import { ogSize, renderPageOgImage } from "@/app/og/brand";
import { localeParams, requireLocaleParam } from "@/lib/i18n/static-params";
import { PRODUCT_FACTS } from "@/lib/product-facts";

export const alt = "QRdx free barcode generator";
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
    label: "Tools",
    title: "Free barcode generator",
    description: `EAN-13, UPC-A, Code 128, GS1-128, ITF-14, Data Matrix and more: ${PRODUCT_FACTS.barcodeFormats} formats, with check digits worked out for you.`,
    footer: "Free · PNG, SVG and EPS · No signup",
  });
}
