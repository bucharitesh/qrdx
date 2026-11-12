import {
  CATALOG_CATEGORIES,
  CATALOG_KIND_LABELS,
  getCatalogBySurface,
} from "@repo/integrations/src/catalog";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { ClientContent } from "@/components/i18n/client-content";
import { ClientMessages } from "@/components/i18n/client-messages";
import { breadcrumbSchema, JsonLd } from "@/components/sections/tools/json-ld";
import { localizedMetadata } from "@/lib/i18n/metadata";
import { localizeHref } from "@/lib/i18n/paths";
import { requireLocale } from "@/lib/i18n/server";
import { getIntegrationAvailability } from "@/lib/integration-availability";
import { filterVisible } from "@/lib/integration-availability-rules";
import { toAvailabilityView } from "@/lib/integration-availability-view";
import {
  IntegrationsDirectory,
  IntegrationsDirectoryFallback,
} from "./components/integrations-directory";
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

export async function generateMetadata(): Promise<Metadata> {
  const locale = await requireLocale();
  const t = await getTranslations({ locale, namespace: "integrations" });
  const listed = listedIntegrations();
  const names = listed.slice(0, 8).map((entry) => entry.name);
  return localizedMetadata({
    locale,
    path: "/integrations",
    title: t("metaTitle"),
    description: t("metaDescription", {
      names: names.join(", "),
      count: listed.length,
    }),
    ownOgImage: true,
  });
}

export default async function IntegrationsPage() {
  const locale = await requireLocale();
  const [t, common] = await Promise.all([
    getTranslations({ locale, namespace: "integrations" }),
    getTranslations({ locale, namespace: "common" }),
  ]);
  const listed = listedIntegrations();
  const slugs = listed.map((entry) => entry.slug);
  const { needsSetup } = toAvailabilityView(getIntegrationAvailability());

  return (
    <main className="flex w-full flex-col">
      <JsonLd
        data={breadcrumbSchema([
          { name: common("home"), path: "/" },
          {
            name: t("metaTitle"),
            path: localizeHref("/integrations", locale),
          },
        ])}
      />
      <IntegrationsHero entries={listed} />

      <section
        id="directory"
        aria-label={t("directory.allTitle")}
        className="scroll-mt-20 border-b px-10 py-12 md:py-16"
      >
        {/* The fallback is the full, unfiltered list, so the server HTML
            links every listed integration (crawlers don't run the filter). */}
        <ClientMessages namespaces={["integrations.directory"]}>
          <ClientContent
            data={{
              categories: CATALOG_CATEGORIES,
              kinds: CATALOG_KIND_LABELS,
              taglines: listed.map((entry) => entry.tagline),
            }}
          >
            <Suspense
              fallback={
                <IntegrationsDirectoryFallback
                  slugs={slugs}
                  needsSetup={needsSetup}
                />
              }
            >
              <IntegrationsDirectory slugs={slugs} needsSetup={needsSetup} />
            </Suspense>
          </ClientContent>
        </ClientMessages>
      </section>

      <IntegrationsMore />
    </main>
  );
}
