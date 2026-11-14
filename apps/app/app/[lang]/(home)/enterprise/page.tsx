import { MAX_CODES_PER_REQUEST, MAX_IMPORT_ROWS } from "@repo/config";
import { Button } from "@repo/design-system/components/ui/button";
import {
  ArrowRight,
  Briefcase,
  Buildings2,
  Code1,
  DocumentDownload,
  Driver,
  Global,
  Key,
  MessageQuestion,
  People,
  Profile2User,
  ReceiptText,
  SecuritySafe,
  SecurityUser,
  TaskSquare,
  Timer1,
  UserOctagon,
} from "iconsax-reactjs";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { LocaleLink } from "@/components/i18n/locale-link";
import { ToolHero } from "@/components/sections/tools/tool-hero";
import {
  AUDIT_EXPORT_MAX_ROWS,
  AUDIT_RETENTION_DAYS,
} from "@/ee/audit-log/limits";
import {
  BUSINESS_REPLY_BUSINESS_DAYS,
  ENTERPRISE_EMAIL,
  ENTERPRISE_REPLY,
} from "@/lib/enterprise";
import { isFeatureAvailable } from "@/lib/feature-availability";
import type { FeatureId } from "@/lib/feature-availability-rules";
import { CHROME_NAMESPACES, pickMessages } from "@/lib/i18n/messages";
import { localizedMetadata } from "@/lib/i18n/metadata";
import { requireLocale } from "@/lib/i18n/server";
import { PLAN_LIMITS } from "@/lib/plans";
import { turnstileSiteKey } from "@/lib/safety/turnstile";
import { EnterpriseContactForm } from "./contact-form";

// /enterprise: who it's for, what it includes and how to buy it. Every
// feature line is something qrdx.dev runs today; lines for features this
// deployment can't offer are left out (lib/feature-availability-rules.ts).
// Enterprise is the Business plan under a contract (lib/enterprise.ts): the
// limits below are Business's, read from lib/plans.ts.

export async function generateMetadata(): Promise<Metadata> {
  const locale = await requireLocale();
  const t = await getTranslations({ locale, namespace: "enterprise" });
  return localizedMetadata({
    locale,
    path: "/enterprise",
    title: t("metaTitle"),
    description: t("metaDescription"),
    ownOgImage: true,
  });
}

const LINK =
  "font-medium text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground";

const SECTION = "w-full px-10 py-12 flex flex-col gap-6";
const H2 = "text-2xl font-medium tracking-tighter text-secondary-foreground";

const WHO = [
  { key: "brands", icon: Buildings2 },
  { key: "agencies", icon: Briefcase },
  { key: "security", icon: SecurityUser },
] as const;

const BUSINESS = PLAN_LIMITS.business;

type FeatureKey =
  | "sso"
  | "auditLog"
  | "roles"
  | "seats"
  | "domains"
  | "clients"
  | "api"
  | "export";

/** What you get, in order; `needs` hides a line this server can't offer. */
const FEATURES: readonly {
  key: FeatureKey;
  icon: typeof Key;
  needs?: FeatureId;
}[] = [
  { key: "sso", icon: Key, needs: "sso" },
  { key: "auditLog", icon: TaskSquare, needs: "auditLog" },
  { key: "roles", icon: UserOctagon },
  { key: "seats", icon: People },
  { key: "domains", icon: Global, needs: "customDomains" },
  { key: "clients", icon: Profile2User },
  { key: "api", icon: Code1 },
  { key: "export", icon: DocumentDownload },
];

/** The numbers the feature lines quote, from the code that enforces them. */
const FEATURE_VALUES = {
  rows: AUDIT_EXPORT_MAX_ROWS,
  days: AUDIT_RETENTION_DAYS,
  count: BUSINESS.customDomains,
  requests: BUSINESS.apiRequestsPerDay,
  batch: MAX_CODES_PER_REQUEST,
  importRows: MAX_IMPORT_ROWS,
};

const CONTRACT = [
  { key: "replies", icon: Timer1 },
  { key: "invoice", icon: ReceiptText },
  { key: "review", icon: SecuritySafe },
  { key: "selfHost", icon: Driver },
] as const;

const STEPS = ["ask", "quote", "sign"] as const;

const RELATED = [
  { key: "security", href: "/security" },
  { key: "dpa", href: "/legal/dpa" },
  { key: "subprocessors", href: "/legal/subprocessors" },
  { key: "pricing", href: "/pricing" },
] as const;

export default async function EnterprisePage() {
  const locale = await requireLocale();
  const [t, common, messages] = await Promise.all([
    getTranslations({ locale, namespace: "enterprise" }),
    getTranslations({ locale, namespace: "common" }),
    getMessages(),
  ]);
  const features = FEATURES.filter(
    (feature) => !feature.needs || isFeatureAvailable(feature.needs),
  );
  const businessReply = t("replies.days", {
    count: BUSINESS_REPLY_BUSINESS_DAYS,
  });
  const replyRows = [
    {
      key: "outage",
      when: t("replies.outage"),
      enterprise: t("replies.hours", {
        count: ENTERPRISE_REPLY.outageBusinessHours,
      }),
      business: businessReply,
    },
    {
      key: "other",
      when: t("replies.other"),
      enterprise: t("replies.days", {
        count: ENTERPRISE_REPLY.otherBusinessDays,
      }),
      business: businessReply,
    },
  ];
  const formOffered = isFeatureAvailable("enterpriseRequests");
  const email = ENTERPRISE_EMAIL;

  return (
    <main className="flex flex-col divide-y divide-border min-h-screen w-full">
      <ToolHero
        pattern="halo"
        focus={[0.5, 0.4]}
        crumbs={[
          { name: common("home"), path: "/" },
          { name: common("pricing"), path: "/pricing" },
          { name: t("crumb"), path: "/enterprise" },
        ]}
        title={t("title")}
        intro={[t("intro1"), t("intro2")]}
      >
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          <Button asChild>
            <a href="#contact">
              {t("contactCta")}
              <ArrowRight aria-hidden className="size-4" />
            </a>
          </Button>
          <Button asChild variant="outline">
            <LocaleLink href="/security">{t("securityCta")}</LocaleLink>
          </Button>
        </div>
      </ToolHero>

      <section aria-labelledby="who" className={SECTION}>
        <h2 className={H2} id="who">
          {t("whoTitle")}
        </h2>
        <ul className="grid gap-4 md:grid-cols-3">
          {WHO.map((item) => (
            <li
              className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-sm"
              key={item.key}
            >
              <item.icon aria-hidden className="size-5 text-foreground/80" />
              <h3 className="font-medium text-secondary-foreground">
                {t(`who.${item.key}.title`)}
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t(`who.${item.key}.body`)}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="includes" className={SECTION}>
        <div className="flex flex-col gap-2">
          <h2 className={H2} id="includes">
            {t("featuresTitle")}
          </h2>
          <p className="text-muted-foreground">{t("featuresIntro")}</p>
        </div>
        <ul className="grid gap-4 md:grid-cols-2">
          {features.map((feature) => (
            <li
              className="flex gap-4 rounded-xl border border-border bg-card p-5 shadow-sm"
              key={feature.key}
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-muted/40">
                <feature.icon
                  aria-hidden
                  className="size-4 text-foreground/80"
                />
              </span>
              <div className="flex flex-col gap-1">
                <h3 className="font-medium text-secondary-foreground">
                  {t(`features.${feature.key}.title`)}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {t(`features.${feature.key}.body`, FEATURE_VALUES)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="contract" className={SECTION}>
        <div className="flex flex-col gap-2">
          <h2 className={H2} id="contract">
            {t("contractTitle")}
          </h2>
          <p className="text-muted-foreground">{t("contractIntro")}</p>
        </div>
        <dl className="divide-y divide-border rounded-xl border border-border">
          {CONTRACT.map((item) => (
            <div
              className="grid gap-2 p-5 md:grid-cols-[18rem_1fr] md:gap-6"
              key={item.key}
            >
              <dt className="flex items-center gap-3 font-medium text-secondary-foreground">
                <item.icon
                  aria-hidden
                  className="size-4 shrink-0 text-foreground/80"
                />
                {t(`contract.${item.key}.title`)}
              </dt>
              <dd className="text-sm leading-relaxed text-muted-foreground">
                {item.key === "replies"
                  ? t("contract.replies.body", {
                      outage: ENTERPRISE_REPLY.outageBusinessHours,
                      other: ENTERPRISE_REPLY.otherBusinessDays,
                    })
                  : t(`contract.${item.key}.body`)}
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-muted-foreground">{t("limitsNote")}</p>
      </section>

      <section aria-labelledby="replies" className={SECTION}>
        <h2 className={H2} id="replies">
          {t("repliesTitle")}
        </h2>
        {/* A table from tablets up; a list on phones, where three columns
            of words don't fit. */}
        <div className="hidden overflow-hidden rounded-xl border border-border md:block">
          <table className="w-full table-fixed text-left text-sm">
            <thead className="bg-muted/40">
              <tr className="border-b border-border">
                <th className="px-5 py-4 font-medium text-muted-foreground">
                  {t("replies.when")}
                </th>
                <th className="px-5 py-4 font-medium text-secondary-foreground">
                  {t("replies.enterprise")}
                </th>
                <th className="px-5 py-4 font-medium text-muted-foreground">
                  {t("replies.business")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {replyRows.map((row) => (
                <tr key={row.key}>
                  <th
                    className="px-5 py-4 align-top font-normal text-secondary-foreground"
                    scope="row"
                  >
                    {row.when}
                  </th>
                  <td className="px-5 py-4 align-top font-medium text-secondary-foreground">
                    {row.enterprise}
                  </td>
                  <td className="px-5 py-4 align-top text-muted-foreground">
                    {row.business}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="divide-y divide-border rounded-xl border border-border md:hidden">
          {replyRows.map((row) => (
            <div className="flex flex-col gap-2 p-4 text-sm" key={row.key}>
              <dt className="font-medium text-secondary-foreground">
                {row.when}
              </dt>
              <dd className="flex justify-between gap-4">
                <span className="text-muted-foreground">
                  {t("replies.enterprise")}
                </span>
                <span className="text-right font-medium text-secondary-foreground">
                  {row.enterprise}
                </span>
              </dd>
              <dd className="flex justify-between gap-4 text-muted-foreground">
                <span>{t("replies.business")}</span>
                <span className="text-right">{row.business}</span>
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-muted-foreground">{t("repliesNote")}</p>
      </section>

      <section aria-labelledby="buy" className={SECTION}>
        <h2 className={H2} id="buy">
          {t("buyTitle")}
        </h2>
        <ol className="grid gap-4 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <li className="flex flex-col gap-2" key={step}>
              <span className="grid size-8 place-items-center rounded-full border bg-muted/40 text-sm font-medium tabular-nums text-secondary-foreground">
                {index + 1}
              </span>
              <h3 className="font-medium text-secondary-foreground">
                {t(`buy.${step}.title`)}
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {step === "ask"
                  ? t("buy.ask.body", { email })
                  : t(`buy.${step}.body`)}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section
        aria-labelledby="contact"
        className="w-full scroll-mt-24 px-10 py-12 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:gap-12"
        id="contact"
      >
        <div className="flex flex-col gap-4">
          <h2 className={H2}>{t("formTitle")}</h2>
          <p className="text-muted-foreground">{t("formIntro")}</p>
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <MessageQuestion
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-foreground/80"
            />
            <span>
              {t.rich("orEmail", {
                email,
                mail: (chunks) => (
                  <a className={LINK} href={`mailto:${email}`}>
                    {chunks}
                  </a>
                ),
              })}
            </span>
          </p>
          <nav aria-labelledby="related" className="mt-2 flex flex-col gap-2">
            <h3
              className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
              id="related"
            >
              {t("relatedTitle")}
            </h3>
            <ul className="flex flex-col gap-1.5 text-sm">
              {RELATED.map((link) => (
                <li key={link.key}>
                  <LocaleLink className={LINK} href={link.href}>
                    {t(`related.${link.key}`)}
                  </LocaleLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        {formOffered ? (
          <NextIntlClientProvider
            messages={pickMessages(messages, [
              ...CHROME_NAMESPACES,
              "enterprise.form",
            ])}
          >
            <EnterpriseContactForm
              email={email}
              locale={locale}
              turnstileSiteKey={turnstileSiteKey()}
            />
          </NextIntlClientProvider>
        ) : (
          <div className="flex items-center justify-center rounded-xl border border-border bg-card p-8 text-center">
            <Button asChild size="lg">
              <a href={`mailto:${email}`}>{email}</a>
            </Button>
          </div>
        )}
      </section>
    </main>
  );
}
