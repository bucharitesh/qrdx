import {
  getIntegrationRegistry,
  initializeIntegrations,
} from "@repo/integrations";
import type { Metadata } from "next";
import { SectionHeader } from "@/components/sections/section-header";
import { createMetadata } from "@/lib/metadata";
import { IntegrationsGrid } from "./components/integrations-grid";
import { IntegrationsHero } from "./components/integrations-hero";

initializeIntegrations();

export const metadata: Metadata = createMetadata({
  title: "Integrations",
  description:
    "Connect QRdx to the tools you already use: Dub.sh short links with click analytics and Google Drive images and share links.",
  path: "/integrations",
});

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
