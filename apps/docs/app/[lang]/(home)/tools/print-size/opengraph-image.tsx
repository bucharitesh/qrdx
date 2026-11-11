import { ogSize, renderPageOgImage } from "@/app/og/brand";
import { localeParams, requireLocaleParam } from "@/lib/i18n/static-params";

export const alt = "QRdx QR code print size calculator";
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
    title: "QR code print size calculator",
    description:
      "The minimum printed size from scan distance, data and error correction, in mm and inches.",
  });
}
