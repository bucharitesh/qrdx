import { cn } from "@repo/design-system/lib/utils";
import {
  getCatalogBySurface,
  getCatalogEntry,
  type IntegrationCatalogEntry,
} from "@repo/integrations/src/catalog";
import { ArrowRight, ExportSquare } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { IntegrationLogo } from "@/components/sections/integrations/integration-logo";
import {
  cardClass,
  interactiveCardClass,
  SectionHeading,
} from "@/components/sections/tools/cards";
import { SpotlightLink } from "@/components/sections/tools/spotlight-link";

const pick = (slugs: string[]) =>
  slugs
    .map((slug) => getCatalogEntry(slug))
    .filter((entry): entry is IntegrationCatalogEntry => Boolean(entry));

const AI_LOGOS = pick(["claude", "chatgpt", "cursor", "vscode", "windsurf"]);
const PLUGINS = getCatalogBySurface("plugins");

/** Developer tools in the order people reach for them. */
const BUILD = pick([
  "rest-api",
  "webhooks",
  "image-api",
  "react",
  "cli",
  "shadcn",
]);
/** Each tool's line: integrations.more.build.<slug>. */
const BUILD_LABELS = {
  "rest-api": "restApi",
  webhooks: "webhooks",
  "image-api": "imageApi",
  react: "react",
  cli: "cli",
  shadcn: "shadcn",
} as const;

const BUILD_YOUR_OWN = "/docs/developers/build-an-integration";
const REQUEST_URL = "https://github.com/bucharitesh/qrdx/issues/new";

function LogoStack({ entries }: { entries: IntegrationCatalogEntry[] }) {
  return (
    <span className="flex shrink-0 -space-x-2">
      {entries.map((entry) => (
        <IntegrationLogo
          key={entry.slug}
          logo={entry.logo}
          size="sm"
          className="shadow-[0_0_0_3px_color-mix(in_oklab,var(--foreground)_9%,transparent)] ring-2 ring-card"
        />
      ))}
    </span>
  );
}

function Tile({
  href,
  eyebrow,
  title,
  description,
  logos,
}: {
  href: string;
  eyebrow: string;
  title: string;
  description: string;
  logos: IntegrationCatalogEntry[];
}) {
  return (
    <SpotlightLink
      href={href}
      className={cn(
        cardClass,
        interactiveCardClass,
        "flex h-full min-w-0 flex-col gap-5 p-5 shadow-xs md:p-6 dark:shadow-none",
      )}
    >
      <span className="flex items-center justify-between gap-3">
        <LogoStack entries={logos} />
        <span className="truncate text-xs text-muted-foreground">
          {eyebrow}
        </span>
      </span>
      <span className="flex min-w-0 flex-col gap-1.5">
        <span className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
          {title}
          <ArrowRight
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground transition-[transform,color] duration-200 group-hover:translate-x-0.5 group-hover:text-foreground"
          />
        </span>
        <span className="text-sm leading-relaxed text-muted-foreground text-pretty">
          {description}
        </span>
      </span>
    </SpotlightLink>
  );
}

/**
 * What used to be mixed into the directory: AI assistants (the MCP page),
 * plugins for other apps, and the APIs and libraries to build your own.
 */
export function IntegrationsMore() {
  const t = useTranslations("integrations.more");
  return (
    <>
      <section
        aria-label={t("label")}
        className="border-b px-10 py-12 md:py-16"
      >
        <ul className="grid gap-4 md:grid-cols-2">
          <li className="min-w-0">
            <Tile
              href="/mcp"
              eyebrow={t("mcpEyebrow")}
              title={t("mcpTitle")}
              description={t("mcpDescription")}
              logos={AI_LOGOS}
            />
          </li>
          <li className="min-w-0">
            <Tile
              href="/plugins"
              eyebrow={t("pluginsEyebrow", { count: PLUGINS.length })}
              title={t("pluginsTitle")}
              description={t("pluginsDescription")}
              logos={PLUGINS}
            />
          </li>
        </ul>
      </section>

      <section
        id="build"
        aria-labelledby="build-heading"
        className="scroll-mt-20 px-10 py-12 md:py-16"
      >
        <div className="grid gap-8 rounded-2xl border bg-card p-6 shadow-xs md:p-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-12 dark:shadow-none">
          <div className="flex min-w-0 flex-col justify-between gap-6">
            <SectionHeading
              id="build-heading"
              eyebrow={t("buildEyebrow")}
              title={t("buildTitle")}
              description={t("buildDescription")}
            />
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              <Link
                href={BUILD_YOUR_OWN}
                className="group inline-flex items-center gap-1.5 text-sm font-medium text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground"
              >
                {t("buildOwn")}
                <ArrowRight
                  aria-hidden
                  className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
                />
              </Link>
              <a
                href={REQUEST_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {t("request")}
                <ExportSquare aria-hidden className="size-3.5" />
              </a>
            </div>
          </div>
          <ul className="grid content-start gap-2 sm:grid-cols-2">
            {BUILD.map((entry) => (
              <li key={entry.slug} className="min-w-0">
                <SpotlightLink
                  href={entry.canonicalPath ?? entry.docs ?? "/docs"}
                  className={cn(
                    "group flex h-full min-w-0 items-center gap-3 rounded-xl border bg-background/60 p-3 transition-colors hover:border-foreground/15 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 dark:bg-background/30",
                  )}
                >
                  <IntegrationLogo logo={entry.logo} size="sm" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium text-foreground">
                      {entry.name}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {entry.slug in BUILD_LABELS
                        ? t(
                            `build.${BUILD_LABELS[entry.slug as keyof typeof BUILD_LABELS]}`,
                          )
                        : entry.tagline}
                    </span>
                  </span>
                  <ArrowRight
                    aria-hidden
                    className="size-3.5 shrink-0 text-muted-foreground transition-[transform,color] duration-200 group-hover:translate-x-0.5 group-hover:text-foreground"
                  />
                </SpotlightLink>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
