import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@repo/design-system/components/ui/accordion";
import { SectionHeader } from "@/components/sections/section-header";
import type { AIArtAllowances } from "./ai-art-studio";
import { ART_MAX_VARIATIONS, ART_TEXT_MAX_LENGTH } from "./config";
import { AI_ART_PRESETS } from "./presets";

const count = (value: number | null) =>
  value === null ? "unlimited" : String(value);

function faqItems(allowances: AIArtAllowances) {
  return [
    {
      question: "Will the QR art actually scan?",
      answer:
        "Usually, but not always. Every image is generated from a QR code with the highest error correction level (H), and afterwards QRdx decodes every variation in your browser and marks the best scannable one. If none scans, raise QR visibility and retry with the same seed. Always test the final image with a phone camera before printing it.",
    },
    {
      question: "How many images can I make?",
      answer: `Each image uses one AI art credit, and so does each 2× upscale. Free accounts get ${count(allowances.free)} credits a month, Pro ${count(allowances.pro)} and Business ${count(allowances.business)}, shared by everyone in the team. Credits reset on the first of each month (UTC), and there is also a safety limit of 25 images per person per day. If a generation fails, its credit is refunded.`,
    },
    {
      question: "Do I need an account?",
      answer:
        "Yes. Each image runs on a paid GPU model, so you need to sign in. AI art credits are separate from AI theme generation.",
    },
    {
      question: "Can I change the link after printing?",
      answer:
        "No. The content is part of the artwork, so AI art codes are static. For a destination you can edit later, with scan analytics, create a dynamic code in your dashboard and use its short link as the content of your AI art code.",
    },
    {
      question: "What do QR visibility and creativity do?",
      answer:
        "QR visibility sets how strongly the image model has to follow the QR pattern (the ControlNet conditioning scale): higher keeps the modules crisp and easy to scan, lower gives the model more freedom. Creativity sets how freely the model interprets your prompt (the guidance scale): lower follows your words closely, higher improvises.",
    },
    {
      question: "What are seeds and variations?",
      answer: `A seed fixes the model's starting noise, so the same seed and settings give the same image. Each run makes 1 to ${ART_MAX_VARIATIONS} variations with different seeds; lock a seed to explore small changes to the prompt or sliders around one result.`,
    },
    {
      question: "What does the reference image do?",
      answer:
        "Its light and dark shapes, in grayscale and at low strength, are blended into the hidden QR guide the model follows, which nudges the composition. It doesn't transfer colors or style: those come from your prompt. Only images you upload are accepted, never links.",
    },
    {
      question: "Can I print it large?",
      answer:
        "Images are 1024 × 1024 pixels. Upscale 2× gives you 2048 × 2048 pixels with Real-ESRGAN on fal.ai, enough for about 17 cm (6.8 in) at 300 dpi. For any size, the vector Logo QR and Image QR modes in the playground export SVG, PDF and EPS.",
    },
    {
      question: "What can I encode?",
      answer: `Any link or text up to ${ART_TEXT_MAX_LENGTH} characters. Shorter content produces fewer, larger modules, which gives cleaner artwork and more reliable scans.`,
    },
    {
      question: "Which AI model is used?",
      answer: `Illusion Diffusion on fal.ai: Stable Diffusion 1.5 guided by the QR Code Monster ControlNet, with ${AI_ART_PRESETS.length} style presets written for it. QRdx draws a plain black-and-white QR code on the server and the model paints your scene around its pattern.`,
    },
    {
      question: "Does QRdx store my prompt or image?",
      answer:
        "QRdx doesn't save your prompt, reference image or the generated images; it only counts your credits. The prompt and the guide image are sent to fal.ai to create the artwork, and results are served from fal.ai's CDN, so download them to keep a copy.",
    },
  ];
}

export function AIArtFAQ({ allowances }: { allowances: AIArtAllowances }) {
  const FAQ_ITEMS = faqItems(allowances);
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
