import { ogSize, renderPageOgImage } from "@/app/og/brand";
import { localeParams, requireLocaleParam } from "@/lib/i18n/static-params";

export const alt = "QRdx online QR code and barcode scanner";
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
    label: "Scanner",
    title: "Scan QR codes and barcodes online",
    description:
      "Use your camera or an image, and see where a link goes before it opens.",
    footer: "Free · No app · No signup",
  });
}
