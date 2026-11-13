// The pricing FAQ in any language (messages: pricing.faq), with prices from
// lib/pricing. The page and /pricing.md (English, for agents) both read it.
import type { Messages } from "@/lib/i18n/messages";
import {
  EUR_PRICES,
  formatPrice,
  MONEY_BACK_DAYS,
  NONPROFIT_DISCOUNT_PERCENT,
  type PaidPlan,
  PRICING,
  type PricingCurrency,
} from "@/lib/pricing";
import { FREE_SCAN_HISTORY_YEARS } from "@/lib/scan-history";
import { englishPricingCopy, type PricingCopy } from "./plan-content";

type FaqKey = keyof Messages["pricing"]["faq"]["items"];

export interface PricingFaqOptions {
  /** Euro prices are on (lib/pricing.ts EUR_PRICES) */
  eur?: boolean;
  /** Non-profit discount requests are offered here (feature nonprofitDiscounts) */
  nonprofit?: boolean;
}

/** The questions, in order, for what this deployment offers. */
export function pricingFaqKeys({
  eur = EUR_PRICES,
  nonprofit = false,
}: PricingFaqOptions = {}): FaqKey[] {
  return [
    "cancel",
    "refund",
    "paymentFails",
    "scans",
    // With euro prices, one answer covers both other currencies.
    eur ? "currencies" : "rupees",
    "switchPlans",
    "teams",
    "selfHost",
    ...(nonprofit ? (["nonprofit"] as const) : []),
    "billing",
  ];
}

export function pricingFaqs(
  copy: PricingCopy = englishPricingCopy(),
  options: PricingFaqOptions = {},
): { question: string; answer: string }[] {
  const amount = (
    plan: PaidPlan,
    interval: "month" | "year",
    currency: PricingCurrency,
  ) =>
    formatPrice(
      PRICING[plan][interval].amounts[currency],
      currency,
      copy.locale,
    );
  const values = {
    proMonthly: amount("pro", "month", "INR"),
    proYearly: amount("pro", "year", "INR"),
    businessMonthly: amount("business", "month", "INR"),
    businessYearly: amount("business", "year", "INR"),
    proMonthlyEur: amount("pro", "month", "EUR"),
    proYearlyEur: amount("pro", "year", "EUR"),
    businessMonthlyEur: amount("business", "month", "EUR"),
    businessYearlyEur: amount("business", "year", "EUR"),
    days: MONEY_BACK_DAYS,
    percent: NONPROFIT_DISCOUNT_PERCENT,
    // How far back Free's analytics reach, in years (lib/scan-history.ts)
    historyYears: FREE_SCAN_HISTORY_YEARS,
  };
  return pricingFaqKeys(options).map((key) => ({
    question: copy.t(`faq.items.${key}.question`),
    answer: copy.t(`faq.items.${key}.answer`, values),
  }));
}
