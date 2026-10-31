import { ChevronDown } from "lucide-react";
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
            className="group rounded-lg border border-border bg-secondary-muted open:ring open:ring-secondary/20"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3.5 font-medium [&::-webkit-details-marker]:hidden">
              {faq.question}
              <ChevronDown
                aria-hidden
                className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
              />
            </summary>
            <p className="border-t border-border px-4 py-3 text-muted-foreground leading-relaxed">
              {faq.answer}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
