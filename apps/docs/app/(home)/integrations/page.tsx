import {
  getIntegrationRegistry,
  initializeIntegrations,
} from "@repo/integrations";
import { SectionHeader } from "@/components/sections/section-header";
import { IntegrationsGrid } from "./components/integrations-grid";
import { IntegrationsHero } from "./components/integrations-hero";

initializeIntegrations();

export const metadata = {
  title: "Integrations | QRdx",
  description:
    "Connect your favourite tools with QRdx. Browse analytics, storage, marketing, and more integrations.",
};

export default function IntegrationsPage() {
  const registry = getIntegrationRegistry();
  const integrations = registry.getAll();

  return (
    <main className="flex flex-col items-center justify-center divide-y divide-border w-full">
      <IntegrationsHero />

      <section
        id="all-integrations"
        className="flex flex-col items-center justify-center gap-10 w-full relative px-6 pb-40"
      >
        <SectionHeader>
          <h2 className="text-2xl md:text-3xl font-medium tracking-tighter text-center text-balance">
            All integrations
          </h2>
          <p className="text-muted-foreground text-center text-balance font-medium text-sm">
            Browse and connect tools that fit your workflow.
          </p>
        </SectionHeader>
        <IntegrationsGrid integrations={integrations} />
      </section>
    </main>
  );
}
