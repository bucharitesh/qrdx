import { baseUrl, siteName } from "@/lib/metadata";
import {
  BILLING_INTERVALS,
  PAID_PLANS,
  PLAN_NAMES,
  PRICING,
  PRICING_CURRENCIES,
} from "@/lib/pricing";

const BILLING = {
  month: { label: "monthly", duration: "P1M", unitCode: "MON" },
  year: { label: "yearly", duration: "P1Y", unitCode: "ANN" },
} as const;

/** schema.org Product with one Offer per plan, billing period and currency. */
export function pricingSchema(description: string): Record<string, unknown> {
  const url = new URL("/pricing", baseUrl).toString();

  const free = PRICING_CURRENCIES.map((currency) => ({
    "@type": "Offer",
    name: PLAN_NAMES.free,
    price: 0,
    priceCurrency: currency,
    availability: "https://schema.org/InStock",
    url,
  }));

  const paid = PAID_PLANS.flatMap((plan) =>
    BILLING_INTERVALS.flatMap((interval) =>
      PRICING_CURRENCIES.map((currency) => {
        const price = PRICING[plan][interval].amounts[currency];
        const billing = BILLING[interval];
        return {
          "@type": "Offer",
          name: `${PLAN_NAMES[plan]} (${billing.label})`,
          price,
          priceCurrency: currency,
          availability: "https://schema.org/InStock",
          url,
          priceSpecification: {
            "@type": "UnitPriceSpecification",
            price,
            priceCurrency: currency,
            billingDuration: billing.duration,
            unitCode: billing.unitCode,
          },
        };
      }),
    ),
  );

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: siteName,
    description,
    url,
    brand: { "@type": "Brand", name: siteName },
    image: new URL("/opengraph-image", baseUrl).toString(),
    offers: [...free, ...paid],
  };
}
