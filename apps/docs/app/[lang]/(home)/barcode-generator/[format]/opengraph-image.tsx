import { notFound } from "next/navigation";
import { ogSize, renderPageOgImage } from "@/app/og/brand";
import { getBarcodeFormat } from "@/lib/barcode/formats";
import { requireLocaleParam, withLocaleParams } from "@/lib/i18n/static-params";
import { BARCODE_FORMAT_PAGES, getBarcodeFormatPage } from "./content";

export const alt = "A free barcode generator for one barcode type";
export const size = ogSize;
export const contentType = "image/png";

export function generateStaticParams() {
  return withLocaleParams(() =>
    BARCODE_FORMAT_PAGES.map((page) => ({ format: page.slug })),
  );
}

export default async function Image({
  params,
}: {
  params: Promise<{ lang: string; format: string }>;
}) {
  await requireLocaleParam(params);
  const { format } = await params;
  const page = getBarcodeFormatPage(format);
  if (!page) notFound();

  return renderPageOgImage({
    label: "Barcode generator",
    title: page.title,
    description: getBarcodeFormat(page.id).summary,
    footer: "Free · SVG, PDF, EPS and PNG · No signup",
  });
}
