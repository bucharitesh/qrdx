import { ogSize, renderPageOgImage } from "@repo/design-system/og/brand";
import { MAX_BULK_ROWS } from "@/components/sections/tools/bulk-utils";
import { requireLocaleParam } from "@/lib/i18n/static-params";
import { onDemandParams } from "@/lib/static-params";

export const alt = "QRdx bulk QR code generator";
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
    label: "Tools",
    title: "Bulk QR codes from a CSV file",
    description: `Up to ${MAX_BULK_ROWS.toLocaleString("en-US")} codes as PNG or SVG, zipped, made in your browser.`,
  });
}
