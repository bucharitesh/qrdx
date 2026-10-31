/** biome-ignore-all lint/suspicious/noArrayIndexKey: FAQ items are static config with stable order */
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@repo/design-system/components/ui/accordion";
import { HairlineFigure } from "@/components/mockups/hairline";
import { SectionHeader } from "@/components/sections/section-header";
import { siteConfig } from "@/config/site";

export function FAQSection() {
  const { faqSection } = siteConfig;

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqSection.faQitems.map((item) => ({
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
      <SectionHeader eyebrow="FAQ" pattern="halo">
        <h2 className="text-3xl md:text-4xl font-medium tracking-tighter text-center text-balance">
          {faqSection.title}
        </h2>
        <p className="text-muted-foreground text-center text-balance font-medium">
          {faqSection.description}
        </p>
      </SectionHeader>

      <div className="mx-auto grid w-full max-w-5xl gap-10 px-6 md:grid-cols-[16rem_minmax(0,1fr)] md:gap-14 md:px-10">
        <div className="hidden flex-col gap-4 md:flex">
          <HairlineFigure figure="Query" className="aspect-[5/4] w-full" />
          <p className="text-sm text-muted-foreground text-pretty leading-relaxed">
            Something else?{" "}
            <a
              href="mailto:support@qrdx.dev"
              className="font-medium text-foreground underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground"
            >
              support@qrdx.dev
            </a>
          </p>
        </div>
        <Accordion type="single" collapsible className="w-full border-t">
          {faqSection.faQitems.map((faq, index) => (
            <AccordionItem
              key={index}
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
