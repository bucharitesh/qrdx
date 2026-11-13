import { AI_REQUEST_FREE_TIER_LIMIT } from "@repo/config";
import { ogSize, renderPageOgImage } from "@/app/og/brand";
import { localeParams, requireLocaleParam } from "@/lib/i18n/static-params";

export const alt = "The QRdx AI QR code designer";
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
    label: "AI",
    title: "Design a QR code from a prompt",
    description:
      "Say what the code should open and how it should look. The AI checks the scan score and repairs the design until it's Great.",
    footer: `Free accounts include ${AI_REQUEST_FREE_TIER_LIMIT} AI requests`,
  });
}
