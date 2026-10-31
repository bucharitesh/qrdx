import { getCatalogBySurface } from "@repo/integrations/src/catalog";
import type { Metadata } from "next";
import { Suspense } from "react";
import { breadcrumbSchema, JsonLd } from "@/components/sections/tools/json-ld";
import { getIntegrationAvailability } from "@/lib/integration-availability";
import { filterVisible } from "@/lib/integration-availability-rules";
import { toAvailabilityView } from "@/lib/integration-availability-view";
import { createMetadata } from "@/lib/metadata";
import { IntegrationsDirectory } from "./components/integrations-directory";
import { IntegrationsHero } from "./components/integrations-hero";
import { IntegrationsMore } from "./components/integrations-more";

/**
 * Third-party connections this server can offer: in production and preview
 * builds, the ones that need setup on QRdx's side are left out.
 */
function listedIntegrations() {
  return filterVisible(
    getIntegrationAvailability(),
    getCatalogBySurface("integrations"),
    (entry) => entry.slug,
  );
}

export function generateMetadata(): Metadata {
  const listed = listedIntegrations();
  const names = listed.slice(0, 8).map((entry) => entry.name);
  return createMetadata({
    title: "Integrations",
    description: `Connect QRdx to ${names.join(", ")} and more: ${listed.length} integrations with exact setup steps.`,
    path: "/integrations",
  });
}

export default function IntegrationsPage() {
  const listed = listedIntegrations();
  const { needsSetup } = toAvailabilityView(getIntegrationAvailability());

  return (
    <main className="flex w-full flex-col">
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Integrations", path: "/integrations" },
        ])}
      />
      <IntegrationsHero entries={listed} />

      <section
        id="directory"
        aria-label="All integrations"
        className="scroll-mt-20 border-b px-6 py-12 md:px-10 md:py-16"
      >
        <Suspense fallback={<div className="min-h-[40rem]" />}>
          <IntegrationsDirectory
            slugs={listed.map((entry) => entry.slug)}
            needsSetup={needsSetup}
          />
        </Suspense>
      </section>

      <IntegrationsMore />
    </main>
  );
}
