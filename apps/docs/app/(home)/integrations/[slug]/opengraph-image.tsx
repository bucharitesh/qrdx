import {
  getCatalogEntry,
  getCatalogRedirect,
  getIntegrationCatalog,
} from "@repo/integrations/src/catalog";
import { notFound } from "next/navigation";
import { ogSize, renderPageOgImage } from "@/app/og/brand";
import { getIntegrationAvailability } from "@/lib/integration-availability";
import { isVisible } from "@/lib/integration-availability-rules";
import { buildTimeParams } from "@/lib/static-params";

export const alt = "A QRdx integration";
export const size = ogSize;
export const contentType = "image/png";

export function generateStaticParams() {
  return buildTimeParams(() =>
    getIntegrationCatalog().map((entry) => ({ slug: entry.slug })),
  );
}

// Same rule as the page: moved entries and ones this deployment hides get none.
export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entry = getCatalogEntry(slug);
  if (
    !entry ||
    getCatalogRedirect(entry) ||
    !isVisible(getIntegrationAvailability(), entry.slug)
  ) {
    notFound();
  }

  return renderPageOgImage({
    label: "Integrations",
    title: `${entry.name} integration`,
    description: entry.tagline,
    footer: "Open source · qrdx.dev",
  });
}
