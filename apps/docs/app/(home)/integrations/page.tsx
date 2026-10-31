import { Card } from "@repo/design-system/components/ui/card";
import { getIntegrationCatalog } from "@repo/integrations/src/catalog";
import { ArrowRight } from "iconsax-reactjs";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { HairlineFigure } from "@/components/mockups/hairline";
import { breadcrumbSchema, JsonLd } from "@/components/sections/tools/json-ld";
import { getUnconfiguredIntegrationSlugs } from "@/lib/integration-availability";
import { createMetadata } from "@/lib/metadata";
import { IntegrationsDirectory } from "./components/integrations-directory";
import { IntegrationsHero } from "./components/integrations-hero";

export const metadata: Metadata = createMetadata({
  title: "Integrations",
  description: `Connect QRdx to Slack, Discord, Zapier, Make, n8n, Dub, Google Drive, Claude, ChatGPT, Cursor and more: ${getIntegrationCatalog().length} integrations with exact setup steps.`,
  path: "/integrations",
});

const linkClass =
  "inline-flex items-center gap-1 font-medium text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground";

export default function IntegrationsPage() {
  return (
    <main className="flex w-full flex-col">
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Integrations", path: "/integrations" },
        ])}
      />
      <IntegrationsHero />

      <section
        id="directory"
        aria-label="All integrations"
        className="scroll-mt-20 border-b px-6 py-12 md:px-10 md:py-16"
      >
        <Suspense fallback={<div className="min-h-[40rem]" />}>
          <IntegrationsDirectory
            unconfigured={getUnconfiguredIntegrationSlugs()}
          />
        </Suspense>
      </section>

      <section className="px-6 py-12 md:px-10 md:py-16">
        <Card className="grid items-center gap-6 p-6 shadow-xs md:grid-cols-[minmax(0,1fr)_auto] md:p-8 dark:shadow-none">
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-semibold tracking-tight text-balance md:text-3xl">
              Don&rsquo;t see your tool?
            </h2>
            <p className="max-w-2xl text-muted-foreground text-pretty">
              Anything that accepts a webhook or calls an HTTP API can work with
              QRdx: send events with{" "}
              <Link href="/integrations/webhooks" className={linkClass}>
                webhooks
              </Link>
              , manage codes with the{" "}
              <Link href="/integrations/rest-api" className={linkClass}>
                REST API
              </Link>
              , or{" "}
              <a
                href="https://github.com/bucharitesh/qrdx/issues/new"
                target="_blank"
                rel="noopener noreferrer"
                className={linkClass}
              >
                request an integration
                <ArrowRight aria-hidden className="size-3.5 -rotate-45" />
              </a>
              .
            </p>
          </div>
          <HairlineFigure
            figure="Hub"
            surface="card"
            className="hidden aspect-square w-36 md:block"
          />
        </Card>
      </section>
    </main>
  );
}
