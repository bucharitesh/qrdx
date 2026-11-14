import { ogSize, renderPageOgImage } from "@/app/og/brand";
import { AI_ART_PRESET_COUNT } from "@/components/sections/ai-art/preset-meta";
import { isArtConfigured } from "@/lib/ai/art";
import { ART_MODEL_LABEL } from "@/lib/ai/art-models";
import { requireLocaleParam } from "@/lib/i18n/static-params";
import { PLAN_LIMITS } from "@/lib/plans";
import { onDemandParams } from "@/lib/static-params";

export const alt = "Scannable QR code art from QRdx";
export const size = ogSize;
export const contentType = "image/png";

// Same switch as the page: AI art only where this deployment offers it.
export function generateStaticParams() {
  return onDemandParams();
}

export default async function Image({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  await requireLocaleParam(params);
  return isArtConfigured
    ? renderPageOgImage({
        label: "AI art",
        title: "Scannable AI QR code art",
        description: `Turn a link into art made with ${ART_MODEL_LABEL}: ${AI_ART_PRESET_COUNT} styles, each one checked to scan.`,
        footer: `Free accounts get ${PLAN_LIMITS.free.aiArtPerMonth} a month`,
      })
    : renderPageOgImage({
        label: "QR art",
        title: "QR code art from your logo or a photo",
        description:
          "Blend a logo or a photo into a scannable vector QR code in the playground. Export SVG, PDF or EPS.",
      });
}
