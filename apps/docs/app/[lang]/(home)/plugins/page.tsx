import { GithubLogo, Info } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import {
  getCatalogEntry,
  type IntegrationCatalogEntry,
} from "@repo/integrations/src/catalog";
import { ExportSquare } from "iconsax-reactjs";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import type { ComponentType } from "react";
import { ClientMessages } from "@/components/i18n/client-messages";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { CHAT_BOTS } from "@/components/sections/chat-bots/bots";
import { CodeSnippet } from "@/components/sections/integrations/code-snippet";
import { IntegrationLogo } from "@/components/sections/integrations/integration-logo";
import {
  CardGrid,
  LinkCard,
  SectionHeading,
  textLinkClass,
} from "@/components/sections/tools/cards";
import { FaqList } from "@/components/sections/tools/faq-list";
import { ToolHero } from "@/components/sections/tools/tool-hero";
import { TrackedLink } from "@/lib/analytics/react";
import { isPathAvailable } from "@/lib/feature-availability";
import { INTEGRATION_RULES } from "@/lib/i18n/content-rules";
import { localizeContent } from "@/lib/i18n/content-server";
import { localizedMetadata } from "@/lib/i18n/metadata";
import { requireLocale } from "@/lib/i18n/server";
import { PLUGINS, type PluginInfo, REQUEST_PLUGIN_URL } from "./plugin-data";
import {
  CanvaMock,
  ChromeMock,
  FigmaMock,
  RaycastMock,
} from "./plugin-mockups";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await requireLocale();
  const t = await getTranslations({ locale, namespace: "plugins" });
  return localizedMetadata({
    locale,
    path: "/plugins",
    title: t("metaTitle"),
    description: t("metaDescription"),
    ownOgImage: true,
  });
}

const MOCKS: Record<PluginInfo["slug"], ComponentType> = {
  chrome: ChromeMock,
  figma: FigmaMock,
  raycast: RaycastMock,
  canva: CanvaMock,
};

interface Plugin extends PluginInfo {
  entry: IntegrationCatalogEntry;
}

// The chat bots this deployment has set up (each page needs its bot).
const chatBots = CHAT_BOTS.filter((bot) => isPathAvailable(bot.path));

const plugins: Plugin[] = PLUGINS.flatMap((info) => {
  const entry = getCatalogEntry(info.slug);
  return entry ? [{ ...info, entry }] : [];
});

type Translate = Awaited<ReturnType<typeof getTranslations<"plugins">>>;

/**
 * Which plugins install from their store and which from source, from
 * plugin-data.ts, so the answer can't go stale when a listing goes live.
 */
function storeFaq(
  shown: Plugin[],
  t: Translate,
  list: (names: string[]) => string,
) {
  const listed = shown.filter((plugin) => plugin.storeUrl);
  const fromSource = shown.filter((plugin) => !plugin.storeUrl);
  if (fromSource.length === 0) return [];
  return [
    {
      question: t(listed.length === 0 ? "faq.storeAll" : "faq.storeSome"),
      answer: [
        listed.length > 0 &&
          t("faq.storeListed", {
            names: list(listed.map((plugin) => plugin.entry.name)),
            count: listed.length,
            store: listed[0]?.store ?? "",
          }),
        t("faq.storeSource", {
          names: list(fromSource.map((plugin) => plugin.entry.name)),
          count: fromSource.length,
        }),
      ]
        .filter(Boolean)
        .join(" "),
    },
  ];
}

const FAQS = ["account", "data", "change"] as const;

/** Plugin facts and catalog copy; store names and platforms keep their names. */
const PLUGIN_RULES = {
  skip: [
    ...(INTEGRATION_RULES.skip ?? []),
    "store",
    "storeUrl",
    "installUrl",
    "sourceUrl",
  ],
};

const inkButtonClass =
  "border-transparent bg-black text-white shadow-none hover:bg-black/85 dark:bg-white dark:text-black dark:hover:bg-white/90";

function PluginSection({
  plugin,
  index,
  t,
}: {
  plugin: Plugin;
  index: number;
  t: Translate;
}) {
  const { entry } = plugin;
  const Mock = MOCKS[plugin.slug];
  const headingId = `${plugin.slug}-heading`;
  const flip = index % 2 === 1;

  return (
    <section
      id={plugin.slug}
      aria-labelledby={headingId}
      className="flex scroll-mt-20 flex-col gap-10 px-10 py-14 md:py-20"
    >
      <div
        className={cn(
          "grid items-center gap-10 lg:gap-14",
          // The mockup always gets the wider column, on either side.
          flip
            ? "lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]"
            : "lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]",
        )}
      >
        <div
          className={cn("flex min-w-0 flex-col gap-6", flip && "lg:order-2")}
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <IntegrationLogo logo={entry.logo} />
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {t(`kinds.${plugin.slug}`)}
              </p>
            </div>
            <h2
              id={headingId}
              className="text-2xl font-semibold tracking-tight text-balance md:text-3xl"
            >
              {entry.name}
            </h2>
            <p className="text-base leading-relaxed text-muted-foreground text-pretty md:text-lg">
              {entry.tagline}
            </p>
          </div>

          <ul className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {entry.capabilities.map((capability) => (
              <li
                key={capability.title}
                className="flex flex-col gap-1 border-t pt-3"
              >
                <h3 className="text-sm font-medium text-foreground">
                  {capability.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
                  {capability.description}
                </p>
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">{t("runsOn")}</p>
            <ul className="flex flex-wrap gap-1.5">
              {plugin.platforms.map((platform) => (
                <li
                  key={platform}
                  className="rounded-full border px-2.5 py-0.5 text-xs text-foreground/80"
                >
                  {platform}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2.5">
              {plugin.storeUrl ? (
                <Button asChild className={inkButtonClass}>
                  <TrackedLink
                    event="plugin_install_clicked"
                    props={{ plugin: plugin.slug, target: "store" }}
                    href={plugin.storeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t("getIt", { store: plugin.store })}
                    <ExportSquare aria-hidden className="size-4 opacity-70" />
                  </TrackedLink>
                </Button>
              ) : (
                <Button asChild className={inkButtonClass}>
                  <TrackedLink
                    event="plugin_install_clicked"
                    props={{ plugin: plugin.slug, target: "source" }}
                    href={plugin.installUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <GithubLogo aria-hidden className="size-4" />
                    {t("installSource")}
                  </TrackedLink>
                </Button>
              )}
              <Button asChild variant="outline">
                <a href={`#${plugin.slug}-install`}>{t("setupSteps")}</a>
              </Button>
            </div>
            {!plugin.storeUrl && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Info aria-hidden className="size-4 shrink-0" />
                {t("notListed", { store: plugin.store })}
              </p>
            )}
          </div>
        </div>

        <div className={cn("min-w-0", flip && "lg:order-1")}>
          {/* On phones the mockup spans the column, grid line to grid line,
              so its small UI text stays legible; the copy keeps the gutter. */}
          <div className="-mx-4 rounded-2xl border bg-muted/30 p-3 sm:mx-0 sm:p-6 md:p-8">
            <Mock />
          </div>
        </div>
      </div>

      <div
        id={`${plugin.slug}-install`}
        className="flex scroll-mt-24 flex-col gap-4"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="font-medium">
            {t(plugin.storeUrl ? "install" : "installSource")}
          </h3>
          <a
            href={plugin.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("onGithub", { path: `plugins/${plugin.slug}` })}
            <ExportSquare aria-hidden className="size-3.5" />
          </a>
        </div>
        <ol
          className={cn(
            "grid divide-y rounded-2xl border bg-card shadow-xs md:divide-x md:divide-y-0 dark:shadow-none",
            entry.steps.length === 2
              ? "md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"
              : "md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)_minmax(0,2fr)]",
          )}
        >
          {entry.steps.map((step, stepIndex) => (
            <li
              key={step.title}
              className="flex min-w-0 flex-col gap-3 p-4 md:p-5"
            >
              <div className="flex items-start gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full border bg-muted/40 font-mono text-xs text-foreground/80">
                  {stepIndex + 1}
                </span>
                <div className="flex min-w-0 flex-col gap-1 pt-0.5">
                  <h4 className="text-sm font-medium leading-snug">
                    {step.title}
                  </h4>
                  {step.body && (
                    <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
                      {step.body}
                    </p>
                  )}
                </div>
              </div>
              {step.snippet && (
                <CodeSnippet
                  code={step.snippet.code}
                  label={step.snippet.label}
                />
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export default async function PluginsPage() {
  const locale = await requireLocale();
  const [t, common, format, shown, bots] = await Promise.all([
    getTranslations({ locale, namespace: "plugins" }),
    getTranslations({ locale, namespace: "common" }),
    getFormatter({ locale }),
    // The catalog's copy and the plugin facts in the page's language.
    localizeContent(plugins, locale, PLUGIN_RULES),
    localizeContent(chatBots, locale, { skip: ["name", "path"] }),
  ]);
  const list = (names: string[]) => format.list(names, { type: "conjunction" });
  const faqs = [
    ...storeFaq(shown, t, list),
    ...FAQS.map((key) => ({
      question: t(`faq.${key}Question`),
      answer: t(`faq.${key}Answer`),
    })),
  ];
  return (
    <main className="flex min-h-screen w-full flex-col divide-y divide-border">
      <ToolHero
        pattern="halo"
        focus={[0.5, 0.3]}
        crumbs={[
          { name: common("home"), path: "/" },
          { name: t("crumb"), path: "/plugins" },
        ]}
        title={t("title")}
        intro={[t("intro")]}
      >
        <nav aria-label={t("crumb")}>
          <ul className="flex flex-wrap justify-center gap-2">
            {shown.map((plugin) => (
              <li key={plugin.slug}>
                <a
                  href={`#${plugin.slug}`}
                  className="flex h-10 items-center gap-2 rounded-full border bg-background/80 py-1 pr-4 pl-1.5 text-sm font-medium backdrop-blur-sm transition-colors hover:border-foreground/15 hover:bg-accent"
                >
                  <IntegrationLogo logo={plugin.entry.logo} size="sm" />
                  {plugin.entry.name}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <p className="text-xs text-muted-foreground">{t("badges")}</p>
      </ToolHero>

      <ClientMessages namespaces={["codeSnippet"]}>
        {shown.map((plugin, index) => (
          <PluginSection
            key={plugin.slug}
            plugin={plugin}
            index={index}
            t={t}
          />
        ))}
      </ClientMessages>

      <section
        aria-labelledby="more"
        className="flex flex-col gap-8 px-10 py-14 md:py-16"
      >
        <SectionHeading
          id="more"
          eyebrow={t("moreEyebrow")}
          title={t("moreTitle")}
          description={
            <>
              {t(bots.length > 0 ? "moreWithBots" : "more")}{" "}
              {t.rich("request", {
                link: (chunks) => (
                  <a
                    href={REQUEST_PLUGIN_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={textLinkClass}
                  >
                    {chunks}
                  </a>
                ),
              })}
            </>
          }
        />
        <CardGrid count={3 + bots.length}>
          {bots.map((bot) => (
            <LinkCard
              key={bot.id}
              href={bot.path}
              title={bot.name}
              description={bot.summary}
            />
          ))}
          <LinkCard
            href="/mcp"
            title={t("aiTitle")}
            description={t("aiDescription")}
          />
          <LinkCard
            href="/integrations"
            title={t("integrationsTitle")}
            description={t("integrationsDescription")}
          />
          <LinkCard
            href="/docs/developers/build-an-integration"
            title={t("buildTitle")}
            description={t("buildDescription")}
          />
        </CardGrid>
        <p className="text-sm text-muted-foreground">
          {t.rich("library", {
            link: (chunks) => (
              <Link href="/docs/getting-started" className={textLinkClass}>
                {chunks}
              </Link>
            ),
          })}
        </p>
      </section>

      <FaqList title={t("faqTitle")} faqs={faqs} />
    </main>
  );
}
