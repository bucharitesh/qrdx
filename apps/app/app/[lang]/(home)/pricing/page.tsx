import { auth } from "@repo/auth/server";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { ComparisonTable } from "@/components/sections/pricing/comparison-table";
import { GuaranteeBlock } from "@/components/sections/pricing/guarantee-block";
import {
  buildComparison,
  buildHighlights,
  buildPricingDescription,
  buildPricingIntro,
  type PricingOptions,
  pricingCopy,
} from "@/components/sections/pricing/plan-content";
import { PricingFaq } from "@/components/sections/pricing/pricing-faq";
import { pricingFaqs } from "@/components/sections/pricing/pricing-faqs";
import { pricingSchema } from "@/components/sections/pricing/pricing-schema";
import { PricingSection } from "@/components/sections/pricing-section";
import { JsonLd } from "@/components/sections/tools/json-ld";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { CHROME_NAMESPACES, pickMessages } from "@/lib/i18n/messages";
import { localizedMetadata } from "@/lib/i18n/metadata";
import { requireLocale } from "@/lib/i18n/server";
import { baseUrl } from "@/lib/metadata";
import { getPlan, PLAN_LIMITS, type Plan } from "@/lib/plans";
import {
  CURRENCY_COOKIE,
  CURRENCY_PARAM,
  currencyForRegion,
  resolveRegion,
} from "@/lib/region";
import { logError } from "@/lib/shared";

// Rows, plan-card lines and copy for features that can't work on this
// deployment are left out (lib/feature-availability-rules.ts). The page is
// prerendered, so a change shows up on the next deploy.
const OPTIONS: PricingOptions = {
  aiArt: isFeatureAvailable("aiArt"),
  aiThemes: isFeatureAvailable("aiThemes"),
  customDomains: isFeatureAvailable("customDomains"),
  fileStorage: isFeatureAvailable("fileStorage"),
  emailAlerts: isFeatureAvailable("email"),
  sso: isFeatureAvailable("sso"),
  auditLog: isFeatureAvailable("auditLog"),
  invoiceRequests: isFeatureAvailable("invoiceRequests"),
};

/** What the plan cards (a client component) read from the catalog. */
const PRICING_CARD_NAMESPACES = [
  "pricing.plans",
  "pricing.header",
  "pricing.billing",
  "pricing.currency",
  "pricing.price",
  "pricing.tiers",
  "pricing.cards",
  "pricing.selfHost",
  "pricing.footnote",
  // Agency tools: the pay-by-invoice dialog on the Business card
  "pricing.invoice",
  // The Enterprise card (components/sections/pricing/enterprise-card.tsx)
  "pricing.enterprise",
  // Euro prices, the money-back line and the non-profit discount form
  "pricing.footnoteEur",
  "pricing.offers",
  "pricing.nonprofit",
];

/** The pricing copy in this page's language. */
async function copy() {
  const [locale, messages] = await Promise.all([
    requireLocale(),
    getMessages(),
  ]);
  return { locale, messages, copy: pricingCopy(locale, messages) };
}

export async function generateMetadata(): Promise<Metadata> {
  const { locale, copy: pricing } = await copy();
  return localizedMetadata({
    locale,
    path: "/pricing",
    title: pricing.t("meta.title"),
    description: buildPricingDescription(OPTIONS, pricing),
    keywords: [
      "qrdx pricing",
      "free qr code generator",
      "dynamic qr code pricing",
      "qr code generator business plan",
      "qr code generator india price",
    ],
    // ./opengraph-image.tsx
    ownOgImage: true,
    alternates: {
      types: { "text/markdown": new URL("/pricing.md", baseUrl).toString() },
    },
  });
}

/** The signed-in visitor's own plan; null when signed out (or unknown). */
async function currentPlan(requestHeaders: Headers): Promise<Plan | null> {
  try {
    const session = await auth.api.getSession({ headers: requestHeaders });
    return session?.user?.id ? await getPlan(session.user.id) : null;
  } catch (error) {
    logError(error as Error, { page: "/pricing" });
    return null;
  }
}

export default async function PricingPage({
  searchParams,
}: PageProps<"/[lang]/pricing">) {
  const [requestHeaders, cookieStore, query, { messages, copy: pricing }] =
    await Promise.all([headers(), cookies(), searchParams, copy()]);
  // The region picks the currency; the language only formats it.
  const currency = currencyForRegion(
    resolveRegion({
      param: query[CURRENCY_PARAM],
      cookie: cookieStore.get(CURRENCY_COOKIE)?.value,
      headers: requestHeaders,
    }),
  );
  const plan = await currentPlan(requestHeaders);

  return (
    <main className="flex flex-col items-center justify-center divide-y divide-border min-h-screen w-full">
      <JsonLd data={pricingSchema(buildPricingDescription(OPTIONS))} />
      {/* The plan cards are a client component: they get their copy. */}
      <NextIntlClientProvider
        messages={pickMessages(messages, [
          ...CHROME_NAMESPACES,
          ...PRICING_CARD_NAMESPACES,
        ])}
      >
        <PricingSection
          currency={currency}
          currentPlan={plan}
          description={buildPricingIntro(OPTIONS, pricing)}
          highlights={buildHighlights(PLAN_LIMITS, OPTIONS, pricing)}
        />
      </NextIntlClientProvider>
      <GuaranteeBlock />
      <ComparisonTable
        groups={buildComparison(PLAN_LIMITS, currency, OPTIONS, pricing)}
      />
      <PricingFaq
        faqs={pricingFaqs(pricing, {
          nonprofit: isFeatureAvailable("nonprofitDiscounts"),
        })}
      />
    </main>
  );
}
