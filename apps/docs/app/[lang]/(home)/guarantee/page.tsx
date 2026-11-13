import { Button } from "@repo/design-system/components/ui/button";
import { ArrowRight } from "iconsax-reactjs";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LocaleLink } from "@/components/i18n/locale-link";
import { GUARANTEE_PROMISES } from "@/components/sections/pricing/guarantee-block";
import { ToolHero } from "@/components/sections/tools/tool-hero";
import { siteConfig } from "@/config/site";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { localizedMetadata } from "@/lib/i18n/metadata";
import { requireLocale } from "@/lib/i18n/server";
import { MONEY_BACK_DAYS } from "@/lib/pricing";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await requireLocale();
  const t = await getTranslations({ locale, namespace: "guarantee" });
  return localizedMetadata({
    locale,
    path: "/guarantee",
    title: t("metaTitle"),
    description: t("metaDescription"),
    ownOgImage: true,
  });
}

const UPDATED = "2026-11-13";

const SCENARIOS = [
  "cancel",
  "failed",
  "downgrade",
  "limit",
  "team",
  "ended",
  "shutdown",
] as const;

const LINK =
  "font-medium text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground";

export default async function GuaranteePage() {
  const locale = await requireLocale();
  const [t, common, promises] = await Promise.all([
    getTranslations({ locale, namespace: "guarantee" }),
    getTranslations({ locale, namespace: "common" }),
    getTranslations({ locale, namespace: "pricing.guarantee.promises" }),
  ]);
  // Custom domains only where they can be added (lib/feature-availability-rules.ts).
  const domains = isFeatureAvailable("customDomains") ? "yes" : "no";
  return (
    <main className="flex flex-col divide-y divide-border min-h-screen w-full">
      <ToolHero
        pattern="halo"
        focus={[0.5, 0.4]}
        crumbs={[
          { name: common("home"), path: "/" },
          { name: common("pricing"), path: "/pricing" },
          { name: t("crumb"), path: "/guarantee" },
        ]}
        title={t("title")}
        intro={[t("intro1"), t("intro2")]}
      >
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          <Button asChild>
            <LocaleLink href="/pricing">
              {t("seePricing")}
              <ArrowRight className="size-4" />
            </LocaleLink>
          </Button>
          <Button asChild variant="outline">
            <LocaleLink href="/docs/self-hosting">
              {t("selfHosting")}
            </LocaleLink>
          </Button>
        </div>
      </ToolHero>

      <section
        aria-labelledby="promises"
        className="w-full px-10 py-12 flex flex-col gap-6"
      >
        <h2
          className="text-2xl font-medium tracking-tighter text-secondary-foreground"
          id="promises"
        >
          {t("promisesTitle")}
        </h2>
        <ol className="grid gap-4 md:grid-cols-2">
          {GUARANTEE_PROMISES.map((promise) => (
            <li
              className="flex gap-4 rounded-xl border border-border bg-card p-5 shadow-sm"
              key={promise.key}
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-muted/40">
                <promise.icon
                  aria-hidden
                  className="size-4 text-foreground/80"
                />
              </span>
              <div className="flex flex-col gap-1">
                <h3 className="font-medium text-secondary-foreground">
                  {promises(`${promise.key}.title`)}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {promises(`${promise.key}.body`)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section
        aria-labelledby="scenarios"
        className="w-full px-10 py-12 flex flex-col gap-6"
      >
        <h2
          className="text-2xl font-medium tracking-tighter text-secondary-foreground"
          id="scenarios"
        >
          {t("scenariosTitle")}
        </h2>
        <dl className="divide-y divide-border rounded-xl border border-border">
          {SCENARIOS.map((key) => (
            <div
              className="grid gap-1 p-5 md:grid-cols-[16rem_1fr] md:gap-6"
              key={key}
            >
              <dt className="font-medium text-secondary-foreground">
                {t(`scenarios.${key}.when`)}
              </dt>
              <dd className="text-sm leading-relaxed text-muted-foreground">
                {key === "downgrade"
                  ? t("scenarios.downgrade.outcome", { domains })
                  : t(`scenarios.${key}.outcome`)}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* The money-back guarantee (content/legal/refunds.mdx) */}
      <section
        aria-labelledby="money-back"
        className="w-full px-10 py-12 flex flex-col gap-3 max-w-3xl"
      >
        <h2
          className="text-2xl font-medium tracking-tighter text-secondary-foreground"
          id="money-back"
        >
          {t("moneyBackTitle")}
        </h2>
        <p className="leading-relaxed text-muted-foreground">
          {t.rich("moneyBack", {
            days: MONEY_BACK_DAYS,
            email: siteConfig.links.email,
            mail: (chunks) => (
              <a className={LINK} href={`mailto:${siteConfig.links.email}`}>
                {chunks}
              </a>
            ),
          })}
        </p>
        <p className="text-sm">
          <LocaleLink className={LINK} href="/legal/refunds">
            {t("moneyBackLink")}
          </LocaleLink>
        </p>
      </section>

      <section
        aria-labelledby="exception"
        className="w-full px-10 py-12 flex flex-col gap-3 max-w-3xl"
      >
        <h2
          className="text-2xl font-medium tracking-tighter text-secondary-foreground"
          id="exception"
        >
          {t("exceptionTitle")}
        </h2>
        <p className="leading-relaxed text-muted-foreground">
          {t.rich("exception", {
            terms: (chunks) => (
              <LocaleLink className={LINK} href="/legal/terms-of-service">
                {chunks}
              </LocaleLink>
            ),
            report: (chunks) => (
              <LocaleLink className={LINK} href="/report-abuse">
                {chunks}
              </LocaleLink>
            ),
          })}
        </p>
        <p className="text-sm text-muted-foreground">
          {t.rich("questions", {
            email: siteConfig.links.email,
            date: new Date(`${UPDATED}T00:00:00Z`),
            mail: (chunks) => (
              <a className={LINK} href={`mailto:${siteConfig.links.email}`}>
                {chunks}
              </a>
            ),
            time: (chunks) => <time dateTime={UPDATED}>{chunks}</time>,
          })}
        </p>
      </section>
    </main>
  );
}
