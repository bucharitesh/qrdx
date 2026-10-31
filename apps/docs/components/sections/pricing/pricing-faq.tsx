import { Card } from "@repo/design-system/components/ui/card";
import { ArrowDown2, MessageQuestion } from "iconsax-reactjs";
import { faqSchema, JsonLd } from "@/components/sections/tools/json-ld";
import { siteConfig } from "@/config/site";

interface PricingFaqProps {
  faqs: { question: string; answer: string }[];
}

/** Two-column FAQ; native <details> keeps every answer in the server HTML. */
export function PricingFaq({ faqs }: PricingFaqProps) {
  return (
    <section
      aria-labelledby="pricing-faq"
      className="w-full px-6 py-16 md:py-20"
      id="faq"
    >
      <JsonLd data={faqSchema(faqs)} />
      <div className="mx-auto grid max-w-5xl gap-10 md:grid-cols-[1fr_2fr] md:gap-12">
        <div className="flex flex-col gap-3 md:sticky md:top-24 md:self-start">
          <h2
            className="text-2xl font-semibold tracking-tight text-balance md:text-3xl"
            id="pricing-faq"
          >
            Pricing questions
          </h2>
          <p className="text-pretty text-muted-foreground">
            Billing, limits and what happens to your codes if you stop paying.
          </p>
          <Card className="mt-2 flex-row items-center gap-3 p-4 shadow-xs">
            <span className="grid size-9 shrink-0 place-items-center rounded-full border bg-muted/40">
              <MessageQuestion
                aria-hidden
                className="size-4 text-foreground/80"
              />
            </span>
            <p className="text-sm text-muted-foreground">
              Something else? Email{" "}
              <a
                className="font-medium text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground"
                href={`mailto:${siteConfig.links.email}`}
              >
                {siteConfig.links.email}
              </a>
            </p>
          </Card>
        </div>

        <Card className="gap-0 divide-y overflow-hidden py-0 shadow-xs">
          {faqs.map((faq) => (
            <details className="group" key={faq.question}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-4 text-sm font-medium outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 [&::-webkit-details-marker]:hidden">
                {faq.question}
                <ArrowDown2
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
                />
              </summary>
              <p className="px-6 pb-5 text-sm leading-relaxed text-pretty text-muted-foreground">
                {faq.answer}
              </p>
            </details>
          ))}
        </Card>
      </div>
    </section>
  );
}
