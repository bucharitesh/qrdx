import { auth } from "@repo/auth/server";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { ComparisonTable } from "@/components/sections/pricing/comparison-table";
import { GuaranteeBlock } from "@/components/sections/pricing/guarantee-block";
import {
  buildComparison,
  buildHighlights,
} from "@/components/sections/pricing/plan-content";
import { pricingSchema } from "@/components/sections/pricing/pricing-schema";
import { PricingSection } from "@/components/sections/pricing-section";
import { FaqList } from "@/components/sections/tools/faq-list";
import { JsonLd } from "@/components/sections/tools/json-ld";
import { siteConfig } from "@/config/site";
import { createMetadata } from "@/lib/metadata";
import { getPlan, PLAN_LIMITS, type Plan } from "@/lib/plans";
import { formatPrice, PRICING } from "@/lib/pricing";
import {
  CURRENCY_COOKIE,
  CURRENCY_PARAM,
  currencyForRegion,
  resolveRegion,
} from "@/lib/region";
import { logError } from "@/lib/shared";

const DESCRIPTION = `Static QR codes are free forever. Pro (${formatPrice(PRICING.pro.month.amounts.USD, "USD")}/mo) and Business (${formatPrice(PRICING.business.month.amounts.USD, "USD")}/mo) add unlimited dynamic codes, analytics history, custom domains and teams. Codes keep working if you cancel.`;

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
      <JsonLd data={pricingSchema(DESCRIPTION)} />
      <PricingSection
        currency={currency}
        currentPlan={plan}
        highlights={buildHighlights(PLAN_LIMITS)}
      />
      <GuaranteeBlock />
      <ComparisonTable groups={buildComparison(PLAN_LIMITS, currency)} />
      <FaqList faqs={siteConfig.pricing.faq} title="Pricing questions" />
    </main>
  );
}
