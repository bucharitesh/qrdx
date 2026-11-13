import { SUPPORT_EMAIL } from "@repo/config";
import { ArrowDown2 } from "iconsax-reactjs";
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
 *
 * Native <details> (one open at a time, by `name`) keeps every answer in the
 * server-rendered HTML; a closed Radix accordion panel has no content. The
 * look is the accordion's, including its 0.2s open and close where the
 * browser can animate ::details-content.
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
              href={`mailto:${SUPPORT_EMAIL}`}
              className="font-medium text-foreground underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground"
            >
              {SUPPORT_EMAIL}
            </a>
          </p>
        </div>
        <div className="w-full border-t [interpolate-size:allow-keywords]">
          {items.map((faq) => (
            <details
              className="group border-b [&::details-content]:h-0 [&::details-content]:overflow-hidden [&::details-content]:transition-[height,content-visibility] [&::details-content]:duration-200 [&::details-content]:ease-out [&::details-content]:[transition-behavior:allow-discrete] open:[&::details-content]:h-auto motion-reduce:[&::details-content]:transition-none"
              key={faq.key}
              name="home-faq"
            >
              <summary className="focus-visible:border-ring focus-visible:ring-ring/50 text-foreground/85 group-open:text-foreground flex cursor-pointer list-none items-start justify-between gap-4 rounded-md py-5 text-left text-base font-medium transition-all outline-none focus-visible:ring-[3px] [&::-webkit-details-marker]:hidden">
                {faq.question}
                <ArrowDown2
                  aria-hidden
                  className="text-muted-foreground pointer-events-none size-4 shrink-0 translate-y-0.5 transition-transform duration-200 group-open:rotate-180"
                />
              </summary>
              <div className="pb-5 text-sm text-muted-foreground">
                <p className="max-w-prose leading-relaxed text-pretty">
                  {faq.answer}
                </p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
