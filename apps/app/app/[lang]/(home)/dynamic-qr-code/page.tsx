import { JsonLd } from "@repo/design-system/components/seo/json-ld";
import { Button } from "@repo/design-system/components/ui/button";
import { Card } from "@repo/design-system/components/ui/card";
import { localizeHref } from "@repo/i18n/paths";
import {
  ArrowRight,
  ArrowRight2,
  Chart,
  Code1,
  Edit2,
  Link21,
  Lock1,
  Mobile,
  Routing2,
  ShieldTick,
  TickCircle,
  TrendUp,
} from "iconsax-reactjs";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import {
  CardGrid,
  type CardIcon,
  IconTile,
  LinkCard,
  SectionHeading,
  textLinkClass,
} from "@/components/sections/tools/cards";
import { FaqList } from "@/components/sections/tools/faq-list";
import { ToolHero } from "@/components/sections/tools/tool-hero";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { localizedMetadata } from "@/lib/i18n/metadata";
import { requireLocale } from "@/lib/i18n/server";
import { baseUrl } from "@/lib/metadata";
import { getPlanLimits, type PlanLimits, plansWith } from "@/lib/plans";
import { playgroundHref } from "@/lib/playground-links";
import { PLAN_NAMES } from "@/lib/pricing";
import { PRODUCT_FACTS } from "@/lib/product-facts";
import { MAX_RULES } from "@/lib/redirect/routing";
import { scanHistoryLabel } from "@/lib/scan-history";
import { organizationId } from "@/lib/seo-schema";
import { SHORT_LINK_BASE } from "@/lib/short-links";

// /dynamic-qr-code: the landing page for "dynamic QR code generator", "free
// dynamic QR code", "editable" and "trackable" QR codes. The docs
// (/docs/dynamic-qr-codes and the pages it links) explain each feature; this
// page sells them and links there. Every claim comes from code:
// - limits and which plans include what: lib/plans.ts (plansWith, so copy
//   never names a plan by hand)
// - the 302 with Cache-Control: no-store: app/q/[slug]/resolve.ts
// - routing rules per code: lib/redirect/routing.ts MAX_RULES
// - only URL codes can be dynamic: components/code-builder/playground-request.ts
// - "Make it dynamic" from a link: lib/playground-apply.ts (open=dynamic)
// - the guarantee: app/[lang]/(home)/guarantee and lib/plans.ts
// Custom domains are only mentioned where they can be added
// (packages/availability/rules.ts).

const PATH = "/dynamic-qr-code";

const FREE = getPlanLimits("free");

export async function generateMetadata(): Promise<Metadata> {
  const locale = await requireLocale();
  const t = await getTranslations({ locale, namespace: "dynamicQrCode" });
  return localizedMetadata({
    locale,
    path: PATH,
    title: t("metaTitle"),
    description: t("metaDescription", { count: FREE.dynamicCodes }),
    ownOgImage: true,
  });
}

const STEPS = ["create", "print", "change"] as const;

interface Feature {
  key:
    | "edit"
    | "analytics"
    | "pages"
    | "routing"
    | "controls"
    | "slugs"
    | "tracking"
    | "api";
  icon: CardIcon;
  /** The plans the card's main feature needs; null for every plan. */
  needs: ((limits: PlanLimits) => boolean) | null;
}

const FEATURES: Feature[] = [
  { key: "edit", icon: Edit2, needs: null },
  { key: "analytics", icon: Chart, needs: null },
  { key: "pages", icon: Mobile, needs: null },
  { key: "routing", icon: Routing2, needs: (limits) => limits.routing },
  { key: "controls", icon: Lock1, needs: (limits) => limits.linkControls },
  { key: "slugs", icon: Link21, needs: (limits) => limits.customSlugs },
  { key: "tracking", icon: TrendUp, needs: (limits) => limits.pixels },
  { key: "api", icon: Code1, needs: null },
];

const FREE_ITEMS = [
  "codes",
  "scans",
  "history",
  "pages",
  "organize",
  "api",
] as const;

export default async function DynamicQrCodePage() {
  const locale = await requireLocale();
  const [t, common] = await Promise.all([
    getTranslations({ locale, namespace: "dynamicQrCode" }),
    getTranslations({ locale, namespace: "common" }),
  ]);
  const pageUrl = new URL(localizeHref(PATH, locale), baseUrl).toString();
  const domains = isFeatureAvailable("customDomains");
  const listFormat = new Intl.ListFormat(locale, {
    style: "long",
    type: "conjunction",
  });
  /** "Pro and Business": the plans whose limits pass `allows`. */
  const planList = (allows: (limits: PlanLimits) => boolean) =>
    listFormat.format(plansWith(allows).map((plan) => PLAN_NAMES[plan]));

  const shortHost = new URL(SHORT_LINK_BASE).host;
  const values = {
    count: FREE.dynamicCodes,
    // Free's scan history in years (lib/scan-history.ts)
    years: PRODUCT_FACTS.freeScanHistoryYears,
    pages: FREE.landingPages,
    perDay: FREE.apiRequestsPerDay,
    types: PRODUCT_FACTS.hostedPageTypes,
    rules: MAX_RULES,
    batch: PRODUCT_FACTS.apiBatchCodes,
    rows: PRODUCT_FACTS.importRows,
  };

  const facts = [
    t("facts.free", values),
    t("facts.scans"),
    t("facts.ads"),
    t("facts.openSource"),
  ];

  const featureCopy = (key: Feature["key"]) => {
    switch (key) {
      case "slugs":
        return {
          title: t("features.slugs.title", {
            domains: domains ? "yes" : "no",
          }),
          body: t("features.slugs.body", {
            example: `${shortHost}/q/spring-menu`,
            domains: domains ? "yes" : "no",
          }),
        };
      case "tracking":
        return {
          title: t("features.tracking.title"),
          body: t("features.tracking.body", {
            conversionPlans: planList((limits) => limits.conversions),
          }),
        };
      default:
        return {
          title: t(`features.${key}.title`),
          body: t(`features.${key}.body`, values),
        };
    }
  };

  const faqs = [
    { question: t("faq.freeQuestion"), answer: t("faq.freeAnswer", values) },
    { question: t("faq.expireQuestion"), answer: t("faq.expireAnswer") },
    { question: t("faq.editQuestion"), answer: t("faq.editAnswer") },
    { question: t("faq.trackQuestion"), answer: t("faq.trackAnswer") },
    { question: t("faq.typesQuestion"), answer: t("faq.typesAnswer") },
    ...(domains
      ? [
          {
            question: t("faq.domainQuestion"),
            answer: t("faq.domainAnswer", {
              plans: planList((limits) => limits.customDomains > 0),
            }),
          },
        ]
      : []),
    { question: t("faq.apiQuestion"), answer: t("faq.apiAnswer", values) },
    { question: t("faq.selfHostQuestion"), answer: t("faq.selfHostAnswer") },
  ];

  const more = [
    { href: "/docs/dynamic-qr-codes", key: "docs", icon: Edit2 },
    { href: "/docs/smart-routing", key: "routing", icon: Routing2 },
    { href: "/docs/code-controls", key: "controls", icon: Lock1 },
    { href: "/docs/tracking-and-conversions", key: "tracking", icon: Chart },
    ...(domains
      ? ([
          { href: "/docs/custom-domains", key: "domains", icon: Link21 },
        ] as const)
      : []),
    { href: "/docs/developers/rest-api", key: "api", icon: Code1 },
  ] as const satisfies readonly {
    href: string;
    key: string;
    icon: CardIcon;
  }[];

  return (
    <main className="flex flex-col divide-y divide-border min-h-screen w-full">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "QRdx dynamic QR code generator",
          description: t("metaDescription", values),
          url: pageUrl,
          applicationCategory: "BusinessApplication",
          operatingSystem: "Any (web browser)",
          isAccessibleForFree: true,
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          featureList: [
            `${FREE.dynamicCodes} dynamic QR codes on the free plan, with unlimited scans`,
            "Change a code's destination after printing",
            `Scan analytics with ${scanHistoryLabel(FREE.analyticsRetentionDays)} of history on the free plan`,
            "Hosted mobile pages: link lists, menus, contact cards, coupons, events and forms",
            "Smart routing by device, country, language, time and scan count, A/B splits and UTM parameters",
            "Passwords, start and end dates, scan limits and fallback URLs",
            domains
              ? "Custom back-halves and custom domains for short links"
              : "Custom back-halves for short links",
            "REST API for creating codes and reading scans",
            "Codes keep redirecting on every plan (Never-Hostage Guarantee)",
          ],
          provider: { "@id": organizationId },
        }}
      />
      <ToolHero
        pattern="halo"
        focus={[0.5, 0.4]}
        crumbs={[
          { name: common("home"), path: "/" },
          { name: t("crumb"), path: PATH },
        ]}
        title={t("title")}
        intro={[t("intro1"), t("intro2", values)]}
      >
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          <Button asChild>
            <Link href={playgroundHref({ type: "url", open: "dynamic" })}>
              {t("cta")}
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/pricing">{t("pricingCta")}</Link>
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <ul className="contents">
            {facts.map((fact) => (
              <li key={fact} className="inline-flex items-center gap-1.5">
                <TickCircle aria-hidden className="size-3.5" />
                {fact}
              </li>
            ))}
          </ul>
          <Link
            href="/docs/dynamic-qr-codes"
            className="inline-flex items-center gap-1 font-medium text-foreground/80 underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            {t("docsLink")}
            <ArrowRight2 aria-hidden className="size-3.5" />
          </Link>
        </div>
      </ToolHero>

      <section
        aria-labelledby="how"
        className="flex w-full flex-col gap-8 px-10 py-12 md:py-16"
      >
        <SectionHeading
          id="how"
          eyebrow={t("howEyebrow")}
          title={t("howTitle")}
        />
        <ol className="grid gap-6 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step} className="flex flex-col gap-2">
              <span className="grid size-8 place-items-center rounded-full border bg-muted/40 text-sm font-medium tabular-nums text-secondary-foreground">
                {index + 1}
              </span>
              <h3 className="font-medium text-foreground">
                {t(`steps.${step}.title`)}
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
                {t(`steps.${step}.body`, {
                  example: `${shortHost}/q/aB3dE5f`,
                })}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section
        aria-labelledby="features"
        className="flex w-full flex-col gap-8 px-10 py-12 md:py-16"
      >
        <SectionHeading
          id="features"
          eyebrow={t("featuresEyebrow")}
          title={t("featuresTitle")}
          description={t("featuresDescription")}
        />
        <CardGrid count={FEATURES.length}>
          {FEATURES.map(({ key, icon, needs }) => {
            const { title, body } = featureCopy(key);
            return (
              <Card key={key} className="h-full gap-3 p-5">
                <IconTile icon={icon} />
                <div className="flex min-w-0 flex-col gap-1.5">
                  <h3 className="font-medium text-foreground">{title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
                    {body}
                  </p>
                </div>
                <p className="mt-auto text-xs font-medium text-muted-foreground">
                  {needs
                    ? t("planSome", { plans: planList(needs) })
                    : t("planAll")}
                </p>
              </Card>
            );
          })}
        </CardGrid>
      </section>

      <section
        aria-labelledby="free"
        className="grid w-full gap-8 px-10 py-12 md:py-16 lg:grid-cols-2 lg:gap-12"
      >
        <div className="flex flex-col gap-4">
          <SectionHeading
            id="free"
            eyebrow={t("freeEyebrow")}
            title={t("freeTitle")}
            description={t("freeDescription")}
          />
          <Link href="/pricing" className={`${textLinkClass} w-fit text-sm`}>
            {t("freeLink")}
          </Link>
        </div>
        <Card className="gap-0 p-0">
          <ul className="divide-y">
            {FREE_ITEMS.map((item) => (
              <li
                key={item}
                className="flex items-start gap-3 px-5 py-3.5 text-sm text-foreground"
              >
                <TickCircle
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0 text-foreground/70"
                />
                {t(`freeItems.${item}`, values)}
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section
        aria-labelledby="guarantee"
        className="grid w-full gap-4 px-10 py-12 md:py-16 lg:grid-cols-2"
      >
        <Card className="h-full gap-4 p-6">
          <IconTile icon={ShieldTick} />
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t("guaranteeEyebrow")}
            </p>
            <h2
              id="guarantee"
              className="text-xl font-semibold tracking-tight text-balance"
            >
              {t("guaranteeTitle")}
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
              {t("guaranteeBody")}
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
              {t("openSourceBody")}
            </p>
          </div>
          <div className="mt-auto flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <Link href="/guarantee" className={textLinkClass}>
              {t("guaranteeLink")}
            </Link>
            <Link
              href="/open-source-qr-code-generator"
              className={textLinkClass}
            >
              {t("openSourceLink")}
            </Link>
          </div>
        </Card>
        <Card className="h-full gap-4 p-6">
          <IconTile icon={Edit2} />
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-semibold tracking-tight text-balance">
              {t("staticTitle")}
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
              {t("staticBody")}
            </p>
          </div>
          <div className="mt-auto flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <Link href="/qr-code-generator" className={textLinkClass}>
              {t("staticLink")}
            </Link>
            <Link
              href="/blog/dynamic-vs-static-qr-codes"
              className={textLinkClass}
            >
              {t("blogLink")}
            </Link>
          </div>
        </Card>
      </section>

      <section
        aria-labelledby="more"
        className="flex w-full flex-col gap-8 px-10 py-12 md:py-16"
      >
        <SectionHeading id="more" title={t("moreTitle")} />
        <CardGrid count={more.length}>
          {more.map(({ href, key, icon }) => (
            <LinkCard
              key={key}
              href={href}
              icon={icon}
              title={t(`more.${key}Title`)}
              description={t(`more.${key}Body`)}
            />
          ))}
        </CardGrid>
      </section>

      <FaqList title={t("faqTitle")} faqs={faqs} />
    </main>
  );
}
