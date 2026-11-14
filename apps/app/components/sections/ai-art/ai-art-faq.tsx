import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@repo/design-system/components/ui/accordion";
import { getTranslations } from "next-intl/server";
import { SectionHeader } from "@/components/sections/section-header";
import { localized } from "@/lib/i18n/content-server";
import type { AIArtAllowances } from "./ai-art-studio";
import { faqItems } from "./faq-items";

export async function AIArtFAQ({
  allowances,
}: {
  allowances: AIArtAllowances;
}) {
  const [t, FAQ_ITEMS] = await Promise.all([
    getTranslations("aiArt.faq"),
    localized(faqItems(allowances)),
  ]);
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_ITEMS.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };

  return (
    <section
      id="faq"
      className="relative flex w-full flex-col items-center justify-center gap-10 pb-10"
    >
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: schema markup requires raw JSON
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <SectionHeader>
        <h2 className="text-center text-3xl font-medium tracking-tighter text-balance md:text-4xl">
          {t("title")}
        </h2>
        <p className="text-muted-foreground text-center font-medium text-balance">
          {t("description")}
        </p>
      </SectionHeader>

      <div className="mx-auto w-full max-w-3xl px-10">
        <Accordion
          type="single"
          collapsible
          className="grid w-full gap-2 border-b-0"
        >
          {FAQ_ITEMS.map((faq) => (
            <AccordionItem
              key={faq.question}
              value={faq.question}
              className="grid gap-2 border-0"
            >
              <AccordionTrigger className="bg-secondary-muted border-border data-[state=open]:ring-secondary/20 cursor-pointer rounded-lg border px-4 py-3.5 no-underline hover:no-underline data-[state=open]:ring">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground bg-muted rounded-lg border p-3">
                <p className="leading-relaxed font-medium">{faq.answer}</p>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
