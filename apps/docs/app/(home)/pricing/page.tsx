import { auth } from "@repo/auth/server";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { ComparisonTable } from "@/components/sections/pricing/comparison-table";
import { GuaranteeBlock } from "@/components/sections/pricing/guarantee-block";
import {
  buildComparison,
  buildHighlights,
  buildPricingDescription,
  buildPricingIntro,
  type PricingOptions,
} from "@/components/sections/pricing/plan-content";
import { PricingFaq } from "@/components/sections/pricing/pricing-faq";
import { pricingSchema } from "@/components/sections/pricing/pricing-schema";
import { PricingSection } from "@/components/sections/pricing-section";
import { JsonLd } from "@/components/sections/tools/json-ld";
import { siteConfig } from "@/config/site";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { baseUrl, createMetadata } from "@/lib/metadata";
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
};

const DESCRIPTION = buildPricingDescription(OPTIONS);

// Closed by POLAR_CHECKOUT_ENABLED=0 while Polar can't take payments yet.
const CHECKOUT_OPEN = isFeatureAvailable("checkout");

export const metadata: Metadata = createMetadata({
  title: "Pricing: Free, Pro and Business Plans",
  description: DESCRIPTION,
  keywords: [
    "qrdx pricing",
    "free qr code generator",
    "dynamic qr code pricing",
    "qr code generator business plan",
    "qr code generator india price",
  ],
  path: "/pricing",
  // ./opengraph-image.tsx
  ownOgImage: true,
  alternates: {
    types: { "text/markdown": new URL("/pricing.md", baseUrl).toString() },
  },
});

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
}: PageProps<"/pricing">) {
  const [requestHeaders, cookieStore, query] = await Promise.all([
    headers(),
    cookies(),
    searchParams,
  ]);
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
      <JsonLd
        data={pricingSchema(DESCRIPTION, { checkoutOpen: CHECKOUT_OPEN })}
      />
      <PricingSection
        checkoutOpen={CHECKOUT_OPEN}
        currency={currency}
        currentPlan={plan}
        description={buildPricingIntro(OPTIONS)}
        highlights={buildHighlights(PLAN_LIMITS, OPTIONS)}
      />
      <GuaranteeBlock />
      <ComparisonTable
        groups={buildComparison(PLAN_LIMITS, currency, OPTIONS)}
      />
      <PricingFaq faqs={siteConfig.pricing.faq} />
    </main>
  );
}
