import { ogSize, renderPageOgImage } from "@repo/design-system/og/brand";
import { requireLocaleParam } from "@/lib/i18n/static-params";
import { industries } from "@/lib/seo-content";
import { onDemandParams } from "@/lib/static-params";

export const alt = "QR code ideas by industry";
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
    label: "Industries",
    title: "QR codes by industry",
    description: `Ideas for ${industries.items.length} industries: which code type to use, how big to print and what to write beside the code.`,
    footer: "Free · Open source · qrdx.dev",
  });
}
