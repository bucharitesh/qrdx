import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import {
  getUsedCategories,
  type IntegrationCatalogEntry,
} from "@repo/integrations/src/catalog";
import { ArrowDown, ArrowRight } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import type { CSSProperties } from "react";
import { AsciiField, Backdrop, MeshGradient } from "@/components/fx";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { QrdxLogo } from "@/components/qrdx-logo";
import { IntegrationLogo } from "@/components/sections/integrations/integration-logo";

/** Logos for the orbit, best known first; the rest fill in when hidden. */
const ORBIT_ORDER = [
  "slack",
  "zapier",
  "google-drive",
  "discord",
  "make",
  "hubspot",
  "notion",
  "google-analytics",
  "dub",
  "n8n",
  "stripe",
  "mailchimp",
  "dropbox",
];
const OUTER_COUNT = 8;
const ORBIT_COUNT = 13;

/** Names for the headline, in order of preference. */
const HEADLINE_ORDER = ["slack", "zapier", "google-drive", "hubspot", "make"];

function byPreference(
  entries: IntegrationCatalogEntry[],
  order: string[],
): IntegrationCatalogEntry[] {
  const rank = (entry: IntegrationCatalogEntry) => {
    const index = order.indexOf(entry.slug);
    return index === -1 ? order.length : index;
  };
  return [...entries].sort((a, b) => rank(a) - rank(b));
}

function Ring({
  entries,
  radius,
  reverse,
  className,
}: {
  entries: IntegrationCatalogEntry[];
  /** Fraction of the orbit's width. */
  radius: number;
  reverse?: boolean;
  className?: string;
}) {
  const spin = reverse
    ? "animate-[spin_120s_linear_infinite_reverse]"
    : "animate-[spin_90s_linear_infinite]";
  const counter = reverse
    ? "animate-[spin_120s_linear_infinite]"
    : "animate-[spin_90s_linear_infinite_reverse]";

  return (
    <div
      className={cn(
        "absolute inset-0 motion-reduce:animate-none group-hover/orbit:[animation-play-state:paused]",
        spin,
        className,
      )}
    >
      {entries.map((entry, index) => {
        const angle = (360 / entries.length) * index;
        return (
          <div
            key={entry.slug}
            className="absolute top-1/2 left-1/2"
            style={
              {
                transform: `translate(-50%, -50%) rotate(${angle}deg) translateX(calc(var(--orbit) * ${radius})) rotate(${-angle}deg)`,
              } as CSSProperties
            }
          >
            <div
              className={cn(
                "motion-reduce:animate-none group-hover/orbit:[animation-play-state:paused]",
                counter,
              )}
            >
              <IntegrationLogo
                logo={entry.logo}
                className="shadow-sm ring-1 ring-black/5 dark:shadow-black/40"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** QRdx in the middle, a few of the tools it connects to orbiting around it. */
function Orbit({ entries }: { entries: IntegrationCatalogEntry[] }) {
  const shown = byPreference(entries, ORBIT_ORDER).slice(0, ORBIT_COUNT);
  const outer = shown.slice(0, OUTER_COUNT);
  const inner = shown.slice(OUTER_COUNT);

  return (
    <div
      aria-hidden
      className="group/orbit relative mx-auto aspect-square w-[var(--orbit)] [--orbit:min(18.5rem,calc(100vw-5rem))] sm:[--orbit:22rem]"
    >
      <div className="absolute inset-[7%] rounded-full border border-dashed border-foreground/10" />
      <div className="absolute inset-[25%] rounded-full border border-dashed border-foreground/10" />
      <div className="absolute inset-[38%] rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--foreground)_6%,transparent),transparent)]" />
      <Ring entries={outer} radius={0.43} />
      {inner.length > 0 && <Ring entries={inner} radius={0.25} reverse />}
      <div className="absolute top-1/2 left-1/2 grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border bg-card shadow-sm">
        <QrdxLogo className="size-7 fill-foreground" />
      </div>
    </div>
  );
}

export function IntegrationsHero({
  entries,
}: {
  /** The integrations listed on this server. */
  entries: IntegrationCatalogEntry[];
}) {
  const count = (kind: IntegrationCatalogEntry["kind"]) =>
    entries.filter((entry) => entry.kind === kind).length;
  const named = byPreference(entries, HEADLINE_ORDER)
    .slice(0, 3)
    .map((entry) => entry.name);
  const more = entries.length - named.length;
  const t = useTranslations("integrations.hero");

  const stats = [
    { key: "integrations", value: entries.length },
    { key: "categories", value: getUsedCategories(entries).length },
    { key: "builtIn", value: count("native") },
  ] as const;

  return (
    <section className="relative isolate w-full overflow-hidden border-b">
      <Backdrop className="-z-10">
        <MeshGradient />
        <AsciiField
          variant="rain"
          seed={7}
          className="[mask-image:radial-gradient(ellipse_70%_110%_at_76%_50%,black_25%,rgba(0,0,0,0.35)_70%,transparent_100%)]"
        />
      </Backdrop>
      <div className="grid grid-cols-1 items-center gap-12 px-10 pt-14 pb-14 md:pt-20 md:pb-20 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-16">
        <div className="flex max-w-2xl flex-col gap-6">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t("eyebrow")}
          </p>
          <h1 className="text-4xl font-semibold tracking-tighter text-balance text-secondary-foreground md:text-5xl">
            {more > 0
              ? t("titleMore", { names: named.join(", "), count: more })
              : t("title", { names: named.join(", ") })}
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-muted-foreground text-pretty md:text-lg">
            {t("description")}
          </p>
          <div className="flex flex-wrap items-center gap-2.5">
            <Button asChild>
              <Link href="#directory">
                {t("browse")}
                <ArrowDown aria-hidden className="size-4" />
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="#build">
                {t("build")}
                <ArrowRight aria-hidden className="size-4" />
              </Link>
            </Button>
          </div>
          <ul className="flex flex-wrap gap-x-8 gap-y-3 pt-2">
            {stats.map((stat) => (
              <li
                key={stat.key}
                className="flex items-baseline gap-1.5 text-sm text-muted-foreground"
              >
                <span className="font-display text-2xl font-semibold tabular-nums tracking-tight text-foreground">
                  {stat.value}
                </span>
                {t(`stats.${stat.key}`, { count: stat.value })}
              </li>
            ))}
          </ul>
        </div>
        <Orbit entries={entries} />
      </div>
    </section>
  );
}
