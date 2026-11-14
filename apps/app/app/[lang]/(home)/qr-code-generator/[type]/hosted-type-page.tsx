import { JsonLd } from "@repo/design-system/components/seo/json-ld";
import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import type { Locale } from "@repo/i18n/config";
import { localizeHref } from "@repo/i18n/paths";
import { ArrowRight, Eye, ShieldTick } from "iconsax-reactjs";
import { getTranslations } from "next-intl/server";
import { SignInLink } from "@/components/auth/sign-in-link";
import { LocaleLink } from "@/components/i18n/locale-link";
import {
  CardGrid,
  cardClass,
  LinkCard,
  SectionLink,
  textLinkClass,
} from "@/components/sections/tools/cards";
import { FaqList } from "@/components/sections/tools/faq-list";
import { ToolHero } from "@/components/sections/tools/tool-hero";
import {
  PAGE_TYPE_ICONS,
  QR_TYPE_ICONS,
} from "@/components/sections/tools/topic-icons";
import { isPathAvailable } from "@/lib/feature-availability";
import { formatBytes } from "@/lib/files/types";
import { QR_TYPE_RULES } from "@/lib/i18n/content-rules";
import { localizeContent } from "@/lib/i18n/content-server";
import { demoPath } from "@/lib/landing/demo-paths";
import { baseUrl } from "@/lib/metadata";
import { PLAN_LIMITS, PLANS, type Plan } from "@/lib/plans";
import { PLAN_NAMES } from "@/lib/pricing";
import { getQrType, QR_TYPE_SLUGS } from "@/lib/qr-types-content";
import {
  getHostedQrType,
  HOSTED_QR_TYPES,
  type HostedQrTypeContent,
  hostedTypePath,
} from "@/lib/qr-types-content-hosted";
import { dashboardEntry } from "@/lib/workspace-paths";

/**
 * /qr-code-generator/pdf and /business-card: the code opens a page QRdx
 * hosts, so instead of an inline generator the button starts that page in
 * the dashboard (signed-out visitors sign in first and land there).
 */
export async function HostedTypePage({
  content,
  locale,
}: {
  /** In the page's language (lib/i18n/content-server.ts) */
  content: HostedQrTypeContent;
  locale: Locale;
}) {
  const [t, common] = await Promise.all([
    getTranslations({ locale, namespace: "qrGenerator" }),
    getTranslations({ locale, namespace: "common" }),
  ]);
  const path = hostedTypePath(content.slug);
  const start = dashboardEntry("pages", { new: content.page });
  const statics = await localizeContent(
    [content.compare.staticType, ...content.related]
      .filter((type, index, all) => all.indexOf(type) === index)
      .map((type) => getQrType(type))
      .filter((item) => item !== undefined),
    locale,
    QR_TYPE_RULES,
  );
  const staticType = statics[0];
  const otherHosted = await localizeContent(
    HOSTED_QR_TYPES.filter(
      (item) =>
        item.slug !== content.slug &&
        isPathAvailable(hostedTypePath(item.slug)),
    ).map((item) => ({
      slug: item.slug,
      page: item.page,
      summary: item.summary,
      name: item.name,
    })),
    locale,
  );
  const limit = (value: number) =>
    Number.isFinite(value)
      ? value.toLocaleString(locale)
      : t("hosted.unlimited");
  const bytes = (value: number) =>
    Number.isFinite(value) ? formatBytes(value) : t("hosted.unlimited");
  const rows: { label: string; value: (plan: Plan) => string }[] = [
    {
      label: t("hosted.rowPages"),
      value: (plan) => limit(PLAN_LIMITS[plan].landingPages),
    },
    {
      label: t("hosted.rowDynamic"),
      value: (plan) => limit(PLAN_LIMITS[plan].dynamicCodes),
    },
    {
      label: t("hosted.rowFile"),
      value: (plan) => bytes(PLAN_LIMITS[plan].maxFileBytes),
    },
    {
      label: t("hosted.rowStorage"),
      value: (plan) => bytes(PLAN_LIMITS[plan].storageBytes),
    },
    {
      label: t("hosted.rowBadge"),
      value: (plan) =>
        PLAN_LIMITS[plan].landingPageBadge
          ? t("hosted.badgeShown")
          : t("hosted.badgeRemoved"),
    },
  ];

  return (
    <main className="flex flex-col divide-y divide-border min-h-screen w-full">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: `QRdx ${content.title}`,
          url: new URL(localizeHref(path, locale), baseUrl).toString(),
          applicationCategory: "BusinessApplication",
          operatingSystem: "Any (web browser)",
          isAccessibleForFree: true,
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        }}
      />
      <ToolHero
        pattern="qr"
        crumbs={[
          { name: common("home"), path: "/" },
          { name: t("crumb"), path: "/qr-code-generator" },
          { name: content.name, path },
        ]}
        title={content.title}
        intro={[content.intro[0]]}
      >
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          <Button asChild>
            <SignInLink href={start} rel="nofollow">
              {content.cta}
              <ArrowRight className="size-4" />
            </SignInLink>
          </Button>
          <Button variant="outline" asChild>
            <LocaleLink href={demoPath(content.page, content.demo)}>
              <Eye className="size-4" />
              {t("hosted.demo")}
            </LocaleLink>
          </Button>
        </div>
        <p className="text-sm text-muted-foreground text-center text-pretty">
          {t("hosted.accountNote", {
            pages: PLAN_LIMITS.free.landingPages,
          })}
        </p>
      </ToolHero>

      <section className="grid w-full grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
        <div className="px-10 py-10 flex flex-col gap-4">
          <h2 className="text-2xl font-medium tracking-tighter">
            {t("type.howTo", { name: content.name })}
          </h2>
          <p className="text-muted-foreground leading-relaxed text-pretty">
            {content.intro[1]}
          </p>
          <ol className="flex flex-col gap-3">
            {content.steps.map((step, index) => (
              <li key={step} className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40 font-mono text-xs text-foreground/80">
                  {index + 1}
                </span>
                <span className="text-muted-foreground leading-relaxed">
                  {step}
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div className="px-10 py-10 flex flex-col gap-4 min-w-0">
          <h2 className="text-2xl font-medium tracking-tighter">
            {t("hosted.featuresTitle")}
          </h2>
          <ul className="grid gap-2">
            {content.features.map((feature) => (
              <li
                key={feature.title}
                className={cn(cardClass, "flex flex-col gap-1 p-4")}
              >
                <h3 className="text-sm font-medium text-foreground">
                  {feature.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed text-pretty">
                  {feature.description}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="grid w-full grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
        <div className="px-10 py-10 flex flex-col gap-4">
          <h2 className="text-2xl font-medium tracking-tighter">
            {t("hosted.editTitle")}
          </h2>
          {content.editing.map((paragraph) => (
            <p
              key={paragraph}
              className="text-muted-foreground leading-relaxed text-pretty"
            >
              {paragraph}
            </p>
          ))}
          <p className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm text-foreground">
            <ShieldTick
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
            />
            <span className="leading-relaxed text-pretty">
              {t.rich("hosted.guarantee", {
                link: (chunks) => (
                  <LocaleLink href="/guarantee" className={textLinkClass}>
                    {chunks}
                  </LocaleLink>
                ),
              })}
            </span>
          </p>
        </div>
        <div className="px-10 py-10 flex flex-col gap-4 min-w-0">
          <h2 className="text-2xl font-medium tracking-tighter">
            {t("hosted.plansTitle")}
          </h2>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <caption className="sr-only">
                {t("hosted.plansCaption", { name: content.name })}
              </caption>
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    <span className="sr-only">{t("hosted.colLimit")}</span>
                  </th>
                  {PLANS.map((plan) => (
                    <th
                      key={plan}
                      scope="col"
                      className="px-3 py-2 font-medium"
                    >
                      {PLAN_NAMES[plan]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.label}>
                    <th
                      scope="row"
                      className="px-3 py-2 text-left font-normal text-secondary-foreground"
                    >
                      {row.label}
                    </th>
                    {PLANS.map((plan) => (
                      <td
                        key={plan}
                        className="px-3 py-2 text-muted-foreground whitespace-nowrap"
                      >
                        {row.value(plan)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t.rich("hosted.plansNote", {
              pricing: (chunks) => (
                <LocaleLink href="/pricing" className={textLinkClass}>
                  {chunks}
                </LocaleLink>
              ),
              docs: (chunks) => (
                <LocaleLink
                  href={
                    content.page === "pdf"
                      ? "/docs/files"
                      : "/docs/landing-pages"
                  }
                  className={textLinkClass}
                >
                  {chunks}
                </LocaleLink>
              ),
            })}
          </p>
        </div>
      </section>

      <section
        aria-labelledby="compare"
        className="w-full px-10 py-10 flex flex-col gap-5"
      >
        <h2
          id="compare"
          className="text-2xl font-medium tracking-tighter text-balance"
        >
          {content.compare.title}
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {[
            {
              label: content.compare.staticLabel,
              points: content.compare.staticPoints,
            },
            {
              label: content.compare.hostedLabel,
              points: content.compare.hostedPoints,
            },
          ].map((column) => (
            <div
              key={column.label}
              className={cn(cardClass, "flex flex-col gap-3 p-5")}
            >
              <h3 className="font-medium text-foreground">{column.label}</h3>
              <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-muted-foreground leading-relaxed">
                {column.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        {staticType && (
          <SectionLink href={`/qr-code-generator/${staticType.type}`}>
            {t("hosted.staticLink", { name: staticType.name })}
          </SectionLink>
        )}
      </section>

      <FaqList
        title={t("type.faqTitle", { name: content.name })}
        faqs={content.faqs}
      />

      <section className="w-full px-10 py-10 flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-2xl font-semibold tracking-tight">
            {t("type.related")}
          </h2>
          <SectionLink href="/qr-code-generator">
            {t("type.allTypes", { count: QR_TYPE_SLUGS.length })}
          </SectionLink>
        </div>
        <CardGrid count={otherHosted.length + statics.length}>
          {otherHosted.map((item) => (
            <LinkCard
              key={item.slug}
              href={hostedTypePath(item.slug)}
              icon={PAGE_TYPE_ICONS[item.page]}
              title={t("type.relatedCard", { name: item.name })}
              description={item.summary}
            />
          ))}
          {statics.map((item) => (
            <LinkCard
              key={item.type}
              href={`/qr-code-generator/${item.type}`}
              icon={QR_TYPE_ICONS[item.type]}
              title={t("type.relatedCard", { name: item.name })}
              description={item.summary}
            />
          ))}
        </CardGrid>
      </section>
    </main>
  );
}

/** The hosted type for a slug, unless this deployment can't offer it. */
export function availableHostedType(slug: string) {
  const content = getHostedQrType(slug);
  return content && isPathAvailable(hostedTypePath(content.slug))
    ? content
    : undefined;
}
