import { ogSize, renderPageOgImage } from "@/app/og/brand";
import { localeParams, requireLocaleParam } from "@/lib/i18n/static-params";

export const alt = "Free QR code tools from QRdx";
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
    title: "Free QR code tools",
    description:
      "A bulk generator from CSV, a scan checker, a print size calculator, Wi-Fi and vCard generators and a QR image API.",
  });
}
