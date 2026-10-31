import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@repo/design-system/components/ui/accordion";
import { SectionHeader } from "@/components/sections/section-header";
import { AI_REQUEST_FREE_TIER_LIMIT } from "@/lib/constants";
import { ART_TEXT_MAX_LENGTH } from "./config";

const FAQ_ITEMS = [
  {
    question: "Will the QR art actually scan?",
    answer:
      "Usually, but not always. Every image is generated from a QR code with the highest error correction level (H), and afterwards QRdx tries to decode it in your browser. If that check fails, lower the creativity and retry with the same seed. Always test the final image with a phone camera before printing it.",
  },
  {
    question: "Do I need an account?",
    answer: `Yes. Each image runs on a paid GPU model, so you need to sign in, and every image uses one AI credit. Free accounts get ${AI_REQUEST_FREE_TIER_LIMIT} AI credits in total, shared with AI theme generation. Pro has no credit limit. If a generation fails, the credit is refunded.`,
  },
  {
    question: "Can I change the link after printing?",
    answer:
      "No. The content is part of the artwork, so AI art codes are static. For a destination you can edit later, with scan analytics, create a dynamic code in your dashboard and use its short link as the content of your AI art code.",
  },
  {
    question: "What does the creativity slider do?",
    answer:
      "It sets how strongly the image model has to follow the QR pattern. Low values keep the modules crisp and easy to scan; high values give the model more freedom and can stop the code from scanning.",
  },
  {
    question: "What can I encode?",
    answer: `Any link or text up to ${ART_TEXT_MAX_LENGTH} characters. Shorter content produces fewer, larger modules, which gives cleaner artwork and more reliable scans.`,
  },
  {
    question: "Which AI model is used?",
    answer:
      "Illusion Diffusion on fal.ai: Stable Diffusion 1.5 guided by the QR Code Monster ControlNet. QRdx draws a plain black-and-white QR code on the server and the model paints your scene around its pattern. Images are 1024 × 1024 pixels.",
  },
  {
    question: "Does QRdx store my prompt or image?",
    answer:
      "QRdx doesn't save your prompt or the generated image; it only counts the credit. The prompt and the plain QR code are sent to fal.ai to create the artwork, and the result is served from fal.ai's CDN, so download it to keep a copy.",
  },
];

export function AIArtFAQ() {
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
          AI QR art FAQ
        </h2>
        <p className="text-muted-foreground text-center font-medium text-balance">
          How scannable artwork is made, what it costs and what to check before
          you print.
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
