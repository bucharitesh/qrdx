import { ogSize, renderPageOgImage } from "@repo/design-system/og/brand";
import { requireLocaleParam } from "@/lib/i18n/static-params";
import { placements } from "@/lib/seo-content";
import { onDemandParams } from "@/lib/static-params";

export const alt = "Where to put a QR code, and how big to print it";
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
    label: "Placements",
    title: "QR codes by placement",
    description: `Business cards, packaging, menus, billboards, receipts and ${placements.items.length - 5} more placements, with print sizes for each.`,
    footer: "Free · Open source · qrdx.dev",
  });
}
