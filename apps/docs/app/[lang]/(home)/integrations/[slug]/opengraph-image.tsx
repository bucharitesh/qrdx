import {
  getCatalogEntry,
  getCatalogRedirect,
} from "@repo/integrations/src/catalog";
import { notFound } from "next/navigation";
import { ogSize, renderPageOgImage } from "@/app/og/brand";
import { getFeatures } from "@/lib/feature-availability";
import { configuredEntry } from "@/lib/feature-availability-rules";
import { requireLocaleParam } from "@/lib/i18n/static-params";
import { getIntegrationAvailability } from "@/lib/integration-availability";
import { isVisible } from "@/lib/integration-availability-rules";
import { onDemandParams } from "@/lib/static-params";

export const alt = "A QRdx integration";
export const size = ogSize;
export const contentType = "image/png";

export function generateStaticParams() {
  return onDemandParams();
}

// Same rule as the page: moved entries and ones this deployment hides get none.
export default async function Image({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}) {
  await requireLocaleParam(params);
  const { slug } = await params;
  const entry = getCatalogEntry(slug);
  if (
    !entry ||
    getCatalogRedirect(entry) ||
    !isVisible(getIntegrationAvailability(), entry.slug)
  ) {
    notFound();
  }

  const features = getFeatures();
  const shown = configuredEntry(entry, (id) => features[id]);
  return renderPageOgImage({
    label: "Integrations",
    title: `${shown.name} integration`,
    description: shown.tagline,
    footer: "Open source · qrdx.dev",
  });
}
