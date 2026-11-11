/** biome-ignore-all lint/suspicious/noArrayIndexKey: FAQ items are static config with stable order */
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@repo/design-system/components/ui/accordion";
import { useLocale, useTranslations } from "next-intl";
import { HairlineFigure } from "@/components/mockups/hairline";
import { SectionHeader } from "@/components/sections/section-header";
import { isFeatureAvailable } from "@/lib/feature-availability";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/messages";
import { formatPrice, PRICING } from "@/lib/pricing";
import { PRODUCT_FACTS } from "@/lib/product-facts";

type FaqKey = keyof Messages["home"]["faq"]["items"];

const FAQ_KEYS: readonly FaqKey[] = [
  "free",
  "signup",
  "dynamic",
  "guarantee",
  "compare",
  "logo",
  "openSource",
  "api",
  "paidPlans",
];

function faqValues(locale: Locale) {
  const usd = (plan: "pro" | "business", interval: "month" | "year") =>
    formatPrice(PRICING[plan][interval].amounts.USD, "USD", locale);
  return {
    bodyPatterns: PRODUCT_FACTS.bodyPatterns,
    eyeShapes: PRODUCT_FACTS.eyeShapes,
    eyeCentres: PRODUCT_FACTS.eyeCentres,
    proMonthly: usd("pro", "month"),
    proYearly: usd("pro", "year"),
    businessMonthly: usd("business", "month"),
    businessYearly: usd("business", "year"),
    // Where custom domains can't be added (lib/feature-availability-rules.ts).
    customDomains: isFeatureAvailable("customDomains")
      ? ("yes" as const)
      : ("no" as const),
  };
}

/**
 * Answers only mention features this deployment can offer (custom domains
 * in the paid-plans answer). Counts and prices come from code
 * (lib/product-facts, lib/pricing), in the page's number format.
 */
export function FAQSection() {
  const t = useTranslations("home.faq");
  const values = faqValues(useLocale());

  const items = FAQ_KEYS.map((key) => ({
    key,
    question: t(`items.${key}.question`),
    answer: t(`items.${key}.answer`, values),
  }));

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };

  return (
    <section
      id="faq"
      className="flex flex-col items-center justify-center gap-10 pb-14 md:gap-14 md:pb-20 w-full relative"
    >
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: schema markup requires raw JSON
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <SectionHeader eyebrow={t("eyebrow")} pattern="halo">
        <h2 className="text-3xl md:text-4xl font-medium tracking-tighter text-center text-balance">
          {t("title")}
        </h2>
        <p className="text-muted-foreground text-center text-balance font-medium">
          {t("description")}
        </p>
      </SectionHeader>

      <div className="mx-auto grid w-full max-w-5xl gap-10 px-10 md:grid-cols-[16rem_minmax(0,1fr)] md:gap-14">
        <div className="hidden flex-col gap-4 md:flex">
          <HairlineFigure figure="Question" className="aspect-[5/4] w-full" />
          <p className="text-sm text-muted-foreground text-pretty leading-relaxed">
            {t("somethingElse")}{" "}
            <a
              href="mailto:support@qrdx.dev"
              className="font-medium text-foreground underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground"
            >
              support@qrdx.dev
            </a>
          </p>
        </div>
        <Accordion type="single" collapsible className="w-full border-t">
          {items.map((faq, index) => (
            <AccordionItem
              key={faq.key}
              value={index.toString()}
              className="last:border-b"
            >
              <AccordionTrigger className="cursor-pointer py-5 text-base hover:no-underline data-[state=open]:text-foreground [&:not([data-state=open])]:text-foreground/85">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="pb-5 text-muted-foreground">
                <p className="max-w-prose leading-relaxed text-pretty">
                  {faq.answer}
                </p>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
