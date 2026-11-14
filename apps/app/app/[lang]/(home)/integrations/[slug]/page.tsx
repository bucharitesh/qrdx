import { catalogParagraphs, configuredEntry } from "@repo/availability";
import { Info } from "@repo/design-system/components/icons";
import { JsonLd } from "@repo/design-system/components/seo/json-ld";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Card } from "@repo/design-system/components/ui/card";
import { cn } from "@repo/design-system/lib/utils";
import { localizeHref } from "@repo/i18n/paths";
import {
  CATALOG_CATEGORIES,
  CATALOG_KIND_DESCRIPTIONS,
  CATALOG_KIND_LABELS,
  CATALOG_PLAN_LABELS,
  type CatalogSnippet,
  getCatalogEntry,
  getCatalogRedirect,
  getCategoryLabel,
  getIntegrationCatalog,
  getRelatedEntries,
  withOrigin,
} from "@repo/integrations/src/catalog";
import { ArrowRight } from "iconsax-reactjs";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { GridLines } from "@/components/fx";
import { ClientContent } from "@/components/i18n/client-content";
import { ClientMessages } from "@/components/i18n/client-messages";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { NeedsSetupNote } from "@/components/needs-setup";
import { Breadcrumbs } from "@/components/sections/breadcrumbs";
import { CodeSnippet } from "@/components/sections/integrations/code-snippet";
import { IntegrationAction } from "@/components/sections/integrations/integration-action";
import { IntegrationCard } from "@/components/sections/integrations/integration-card";
import { IntegrationLogo } from "@/components/sections/integrations/integration-logo";
import { resolveAction } from "@/components/sections/integrations/resolve-action";
import { breadcrumbSchema } from "@/components/sections/tools/json-ld";
import { getFeatures, isPathAvailable } from "@/lib/feature-availability";
import { INTEGRATION_RULES } from "@/lib/i18n/content-rules";
import { localizeContent } from "@/lib/i18n/content-server";
import { localizedMetadata } from "@/lib/i18n/metadata";
import { requireLocale } from "@/lib/i18n/server";
import { getIntegrationAvailability } from "@/lib/integration-availability";
import { isVisible, setupNeeded } from "@/lib/integration-availability-rules";
import { baseUrl } from "@/lib/metadata";
import { buildTimeParams } from "@/lib/static-params";

interface IntegrationPageProps {
  params: Promise<{ slug: string }>;
}

// Every slug, including the ones that moved: those prerender as a 308 to
// their new page (getCatalogRedirect), so old links and bookmarks keep working.
// Unknown slugs render notFound() below (lib/static-params.ts).
export function generateStaticParams() {
  return buildTimeParams(() =>
    getIntegrationCatalog().map((entry) => ({ slug: entry.slug })),
  );
}

export async function generateMetadata({
  params,
}: IntegrationPageProps): Promise<Metadata> {
  const [{ slug }, locale] = await Promise.all([params, requireLocale()]);
  const found = getCatalogEntry(slug);
  if (
    !found ||
    getCatalogRedirect(found) ||
    !isVisible(getIntegrationAvailability(), found.slug)
  ) {
    return {};
  }
  const [entry, t] = await Promise.all([
    localizeContent(shownEntry(found), locale, INTEGRATION_RULES),
    getTranslations({ locale, namespace: "integrations.detail" }),
  ]);
  return localizedMetadata({
    locale,
    path: `/integrations/${entry.slug}`,
    title: t("metaTitle", { name: entry.name }),
    description: entry.tagline,
    ownOgImage: true,
  });
}

const ORIGIN = baseUrl.origin;

/** What IntegrationCard reads from the catalog itself (components/i18n/content-text.tsx). */
const CARD_CONTENT = {
  categories: CATALOG_CATEGORIES,
  kinds: CATALOG_KIND_LABELS,
};

/** With the parts only this deployment's extras make true (the Slack bot). */
const shownEntry = <T extends Parameters<typeof configuredEntry>[0]>(
  entry: T,
): T => {
  const features = getFeatures();
  return configuredEntry(entry, (id) => features[id]);
};

const linkClass =
  "font-medium text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground";

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex scroll-mt-24 flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2
          id={id}
          className="text-xl font-semibold tracking-tight text-balance md:text-2xl"
        >
          {title}
        </h2>
        {description && (
          <p className="text-sm text-muted-foreground text-pretty">
            {description}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

function Snippet({ snippet }: { snippet: CatalogSnippet }) {
  return (
    <CodeSnippet
      code={withOrigin(snippet.code, ORIGIN)}
      label={snippet.label}
      wrap={snippet.language === "bash" || snippet.language === "text"}
    />
  );
}

function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-3 first:pt-0 last:pb-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-foreground">{children}</dd>
    </div>
  );
}

export default async function IntegrationDetailPage({
  params,
}: IntegrationPageProps) {
  const [{ slug }, locale] = await Promise.all([params, requireLocale()]);
  const found = getCatalogEntry(slug);
  if (!found) notFound();
  // AI assistants, developer tools, plugins and QRdx features have their own
  // pages now; /integrations only covers third-party connections.
  const moved = getCatalogRedirect(found);
  if (moved) permanentRedirect(localizeHref(moved, locale));
  // The catalog's copy in the page's language (lib/i18n/content-sources.ts).
  const [entry, t, common] = await Promise.all([
    localizeContent(shownEntry(found), locale, INTEGRATION_RULES),
    getTranslations({ locale, namespace: "integrations.detail" }),
    getTranslations({ locale, namespace: "common" }),
  ]);
  const labels = await localizeContent(
    {
      kinds: CATALOG_KIND_LABELS,
      kindDescriptions: CATALOG_KIND_DESCRIPTIONS,
      plans: CATALOG_PLAN_LABELS,
    },
    locale,
  );
  const category = async (id: Parameters<typeof getCategoryLabel>[0]) =>
    localizeContent(getCategoryLabel(id), locale);
  const categories = await Promise.all(entry.categories.map(category));
  // Needs setup on QRdx's side: hidden in production, flagged in local dev.
  const availability = getIntegrationAvailability();
  if (!isVisible(availability, entry.slug)) notFound();

  const related = await localizeContent(
    getRelatedEntries(found, 3, (item) => isVisible(availability, item.slug)),
    locale,
    INTEGRATION_RULES,
  );
  const needsSetup = setupNeeded(availability, entry.slug);
  // The entry's own landing page (the chat bots'), where it's shown here.
  const page =
    entry.page && isPathAvailable(entry.page.href) ? entry.page : null;
  const primary = resolveAction(entry.primaryAction, ORIGIN, t("copied"));
  const secondary = entry.secondaryAction
    ? resolveAction(entry.secondaryAction, ORIGIN, t("copied"))
    : null;
  const crumbs = [
    { name: common("home"), path: "/" },
    { name: t("crumb"), path: "/integrations" },
    { name: entry.name, path: `/integrations/${entry.slug}` },
  ];
  const trail = crumbs.map((crumb) => ({
    ...crumb,
    path: localizeHref(crumb.path, locale),
  }));

  return (
    <main className="flex w-full flex-col">
      <JsonLd data={breadcrumbSchema(trail)} />

      <header className="relative isolate overflow-hidden border-b">
        <GridLines className="-z-10" />
        <div className="flex flex-col gap-8 px-10 pt-8 pb-10 md:pt-10 md:pb-12">
          <Breadcrumbs align="start" items={crumbs} />
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-start">
              <IntegrationLogo logo={entry.logo} size="lg" />
              <div className="flex min-w-0 flex-col gap-2.5">
                <h1 className="text-3xl font-semibold tracking-tighter text-balance text-secondary-foreground md:text-4xl">
                  {entry.name}
                </h1>
                <p className="max-w-2xl text-base leading-relaxed text-muted-foreground text-pretty md:text-lg">
                  {entry.tagline}
                </p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <Badge variant="outline">{labels.kinds[entry.kind]}</Badge>
                  {categories.map((label) => (
                    <Badge
                      key={label}
                      variant="outline"
                      className="text-muted-foreground"
                    >
                      {label}
                    </Badge>
                  ))}
                  <Badge variant="outline" className="text-muted-foreground">
                    {entry.plan === "no-account"
                      ? t("noAccount")
                      : t("planBadge", { plan: labels.plans[entry.plan] })}
                  </Badge>
                </div>
              </div>
            </div>
            <ClientMessages namespaces={["codeSnippet"]}>
              <div className="flex shrink-0 flex-wrap gap-2.5">
                <IntegrationAction action={primary} />
                {secondary && (
                  <IntegrationAction action={secondary} variant="outline" />
                )}
              </div>
            </ClientMessages>
          </div>
          {needsSetup ? (
            <NeedsSetupNote names={needsSetup} className="text-sm" />
          ) : (
            entry.note && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Info aria-hidden className="size-4 shrink-0" />
                {entry.note}
              </p>
            )
          )}
        </div>
      </header>

      <div className="grid gap-12 px-10 py-12 md:py-14 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-14">
        <div className="flex min-w-0 flex-col gap-14">
          <Section id="about" title={t("about")}>
            <div className="flex max-w-3xl flex-col gap-3 text-base leading-relaxed text-muted-foreground text-pretty">
              {catalogParagraphs(entry, getFeatures()).map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
            {page && (
              <Link
                href={page.href}
                className="inline-flex w-fit items-center gap-1 text-sm font-medium text-foreground/80 underline-offset-4 transition-colors hover:text-foreground hover:underline"
              >
                {page.label}
                <ArrowRight aria-hidden className="size-4" />
              </Link>
            )}
          </Section>

          <ClientMessages namespaces={["codeSnippet"]}>
            <Section id="setup" title={t("setup")}>
              <ol className="flex max-w-3xl flex-col">
                {entry.steps.map((step, index) => (
                  <li
                    key={step.title}
                    className="relative grid grid-cols-[2rem_minmax(0,1fr)] gap-4 pb-8 last:pb-0"
                  >
                    {index < entry.steps.length - 1 && (
                      <span
                        aria-hidden
                        className="absolute top-10 bottom-2 left-4 w-px bg-border"
                      />
                    )}
                    <span className="grid size-8 place-items-center rounded-full border bg-card text-sm font-medium tabular-nums">
                      {index + 1}
                    </span>
                    <div className="flex min-w-0 flex-col gap-2 pt-1">
                      <h3 className="font-medium leading-snug">{step.title}</h3>
                      {step.body && (
                        <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
                          {step.body}
                        </p>
                      )}
                      {step.snippet && <Snippet snippet={step.snippet} />}
                    </div>
                  </li>
                ))}
              </ol>
            </Section>
          </ClientMessages>

          <Section id="capabilities" title={t("capabilities")}>
            <ul
              className={cn(
                "grid gap-4",
                entry.capabilities.length === 3
                  ? "sm:grid-cols-3"
                  : "sm:grid-cols-2",
              )}
            >
              {entry.capabilities.map((capability, index, all) => (
                <li
                  key={capability.title}
                  className={cn(
                    all.length !== 3 &&
                      all.length % 2 === 1 &&
                      index === all.length - 1 &&
                      "sm:col-span-2",
                  )}
                >
                  <Card className="h-full gap-1.5 p-5 shadow-xs dark:shadow-none">
                    <h3 className="font-medium leading-snug">
                      {capability.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
                      {capability.description}
                    </p>
                  </Card>
                </li>
              ))}
            </ul>
          </Section>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Card className="gap-0 p-5 shadow-xs dark:shadow-none">
            <dl className="flex flex-col divide-y">
              <MetaRow label={t("type")}>
                {labels.kinds[entry.kind]}
                <span className="mt-0.5 block text-xs font-normal leading-relaxed text-muted-foreground">
                  {labels.kindDescriptions[entry.kind]}
                </span>
              </MetaRow>
              <MetaRow label={t("category")}>{categories.join(", ")}</MetaRow>
              <MetaRow label={t("plan")}>{labels.plans[entry.plan]}</MetaRow>
              <MetaRow label={t("builtBy")}>{entry.builtBy}</MetaRow>
              {entry.website && (
                <MetaRow label={t("website")}>
                  <a
                    href={entry.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={linkClass}
                  >
                    {new URL(entry.website).hostname.replace(/^www\./, "")}
                  </a>
                </MetaRow>
              )}
              {entry.docs && (
                <MetaRow label={t("docs")}>
                  <Link href={entry.docs} className={linkClass}>
                    {t("readGuide")}
                  </Link>
                </MetaRow>
              )}
            </dl>
          </Card>
        </aside>
      </div>

      {related.length > 0 && (
        <section
          aria-labelledby="related"
          className="flex flex-col gap-6 border-t px-10 py-12 md:py-14"
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2
              id="related"
              className="text-xl font-semibold tracking-tight md:text-2xl"
            >
              {t("related")}
            </h2>
            <Link
              href="/integrations"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("all")}
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          </div>
          <ClientContent data={CARD_CONTENT}>
            <ul className="grid gap-4 md:grid-cols-3">
              {related.map((item) => (
                <li key={item.slug}>
                  <IntegrationCard
                    entry={item}
                    needsSetup={setupNeeded(availability, item.slug)}
                  />
                </li>
              ))}
            </ul>
          </ClientContent>
        </section>
      )}
    </main>
  );
}
