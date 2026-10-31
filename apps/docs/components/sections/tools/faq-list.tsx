import { ArrowDown2 } from "iconsax-reactjs";
import { SectionHeader } from "@/components/sections/section-header";
import { faqSchema, JsonLd } from "./json-ld";

interface FaqListProps {
  title: string;
  faqs: { question: string; answer: string }[];
}

/** Native <details> keeps every answer in the server-rendered HTML. */
export function FaqList({ title, faqs }: FaqListProps) {
  return (
    <section
      id="faq"
      className="flex flex-col items-center justify-center pb-10 w-full"
    >
      <JsonLd data={faqSchema(faqs)} />
      <SectionHeader>
        <h2 className="text-2xl md:text-3xl font-medium tracking-tighter text-center text-balance">
          {title}
        </h2>
      </SectionHeader>
      <div className="max-w-3xl w-full mx-auto px-6 md:px-10 pt-10 grid gap-2">
        {faqs.map((faq) => (
          <details
            key={faq.question}
            className="group rounded-xl border border-border bg-card shadow-xs transition-colors open:bg-muted/20 dark:shadow-none"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-xl px-4 py-3.5 font-medium transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 [&::-webkit-details-marker]:hidden">
              {faq.question}
              <ArrowDown2
                aria-hidden
                className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
              />
            </summary>
            <p className="border-t border-border px-4 py-3 text-muted-foreground leading-relaxed text-pretty">
              {faq.answer}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
