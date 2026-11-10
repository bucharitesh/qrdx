// The pricing FAQ in any language (messages: pricing.faq), with prices from
// lib/pricing. The page and /pricing.md (English, for agents) both read it.
import type { Messages } from "@/lib/i18n/messages";
import { formatPrice, type PaidPlan, PRICING } from "@/lib/pricing";
import { englishPricingCopy, type PricingCopy } from "./plan-content";

type FaqKey = keyof Messages["pricing"]["faq"]["items"];

const FAQ_KEYS: readonly FaqKey[] = [
  "cancel",
  "paymentFails",
  "scans",
  "rupees",
  "switchPlans",
  "teams",
  "selfHost",
  "billing",
];

export function pricingFaqs(
  copy: PricingCopy = englishPricingCopy(),
): { question: string; answer: string }[] {
  const inr = (plan: PaidPlan, interval: "month" | "year") =>
    formatPrice(PRICING[plan][interval].amounts.INR, "INR", copy.locale);
  const values = {
    proMonthly: inr("pro", "month"),
    proYearly: inr("pro", "year"),
    businessMonthly: inr("business", "month"),
    businessYearly: inr("business", "year"),
  };
  return FAQ_KEYS.map((key) => ({
    question: copy.t(`faq.items.${key}.question`),
    answer: copy.t(`faq.items.${key}.answer`, values),
  }));
}
