import { ogSize, renderPageOgImage } from "@/app/og/brand";
import { localeParams, requireLocaleParam } from "@/lib/i18n/static-params";

export const alt = "QRdx QR code scan checker";
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
    title: "Will your QR code scan?",
    description:
      "Test a QR code image at small sizes, with blur and low contrast. Runs in your browser.",
  });
}
