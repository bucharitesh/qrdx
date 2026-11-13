// The money-back guarantee, the non-profit discount and euro prices on the
// pricing page: the FAQ follows what's offered, numbers come from
// lib/pricing.ts, and the currency switch only offers euros once they're on.
import { describe, expect, it } from "vitest";
import { switchTargets } from "@/components/sections/pricing/currency-note";
import {
  pricingFaqKeys,
  pricingFaqs,
} from "@/components/sections/pricing/pricing-faqs";
import { localPricesNote } from "@/lib/pricing";

describe("pricing FAQ", () => {
  it("answers refunds everywhere and non-profits only where offered", () => {
    expect(pricingFaqKeys()).toContain("refund");
    expect(pricingFaqKeys()).not.toContain("nonprofit");
    expect(pricingFaqKeys({ nonprofit: true })).toContain("nonprofit");
  });

  it("explains rupees alone until euro prices are on", () => {
    expect(pricingFaqKeys({ eur: false })).toContain("rupees");
    expect(pricingFaqKeys({ eur: false })).not.toContain("currencies");
    expect(pricingFaqKeys({ eur: true })).toContain("currencies");
    expect(pricingFaqKeys({ eur: true })).not.toContain("rupees");
  });

  it("fills in the guarantee's days, the discount and the prices", () => {
    const faqs = pricingFaqs(undefined, { eur: true, nonprofit: true });
    const answer = (start: string) =>
      faqs.find((faq) => faq.question.startsWith(start))?.answer ?? "";
    expect(answer("Can I get my money back")).toContain(
      "30-day money-back guarantee",
    );
    expect(answer("Do you have a discount for non-profits")).toContain(
      "50% off Pro or Business",
    );
    const currencies = answer("Why do I see prices in ₹ or €");
    expect(currencies).toContain("₹199");
    expect(currencies).toContain("€5 a month or €48 a year");
    expect(currencies).toContain("€15 a month or €144 a year");
  });
});

describe("currency switch", () => {
  it("offers euros only once they're on", () => {
    expect(switchTargets("USD", false)).toEqual(["INR"]);
    expect(switchTargets("USD", true)).toEqual(["INR", "EUR"]);
    expect(switchTargets("INR", true)).toEqual(["USD"]);
    expect(switchTargets("EUR", true)).toEqual(["USD"]);
  });
});

describe("prices for agents", () => {
  it("adds euro prices to the Markdown copies once they're on", () => {
    expect(localPricesNote("pro", false)).toBe("in India ₹199 or ₹1,499");
    expect(localPricesNote("business", true)).toBe(
      "in India ₹599 or ₹4,999; in the EU and EEA €15 or €144",
    );
  });
});
