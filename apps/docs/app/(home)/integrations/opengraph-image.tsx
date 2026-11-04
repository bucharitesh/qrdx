import { getCatalogBySurface } from "@repo/integrations/src/catalog";
import { ogSize, renderPageOgImage } from "@/app/og/brand";
import { getIntegrationAvailability } from "@/lib/integration-availability";
import { filterVisible } from "@/lib/integration-availability-rules";

export const alt = "QRdx integrations";
export const size = ogSize;
export const contentType = "image/png";

// The page's list: entries this deployment hides are left out.
export default function Image() {
  const listed = filterVisible(
    getIntegrationAvailability(),
    getCatalogBySurface("integrations"),
    (entry) => entry.slug,
  );
  const names = listed.slice(0, 6).map((entry) => entry.name);

  return renderPageOgImage({
    label: "Integrations",
    title: `${listed.length} integrations for your QR codes`,
    description: `${names.join(", ")} and more, each with exact setup steps.`,
    footer: "Open source · qrdx.dev",
  });
}
