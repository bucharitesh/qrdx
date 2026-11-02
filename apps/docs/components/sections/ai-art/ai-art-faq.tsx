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
        "Every image you receive has been decoded back to your exact content on our server, both as it is and through a simulated phone camera (smaller, blurred and lower in contrast). Gemini starts from a QR code with the highest error correction level (H) and is told to keep its grid. If its version doesn't pass, QRdx blends it into the code with Image QR, which only corrects the modules that would read wrong, and checks it again; an image that still fails isn't delivered and uses no credit. Your browser then scores each variation and picks the best. Still test the final image with a phone camera before printing it.",
    },
    {
      question: "How many images can I make?",
      answer: `Each delivered image uses one AI art credit; the print-size download is free. Free accounts get ${count(allowances.free)} credits a month, Pro ${count(allowances.pro)} and Business ${count(allowances.business)}, shared by everyone in the team. Credits reset on the first of each month (UTC), and there is also a safety limit of 25 images per person per day. If a generation fails or doesn't pass the scan check, no credit is used.`,
    },
    {
      question: "Do I need an account?",
      answer:
        "Yes. Each image is a paid call to Google's Gemini image model, so you need to sign in. AI art credits are separate from AI theme generation.",
    },
    {
      question: "Can I change the link after printing?",
      answer:
        "No. The content is part of the artwork, so AI art codes are static. For a destination you can edit later, with scan analytics, create a dynamic code in your dashboard and use its short link as the content of your AI art code.",
    },
    {
      question: "What do QR visibility and creativity do?",
      answer:
        "QR visibility sets how strongly Gemini is asked to favor the code: higher keeps the modules close to black and white, lower lets the scene's light and shadow form them. It also sets how strongly the code shows if QRdx has to blend the image in. Creativity sets how freely Gemini interprets your prompt: lower follows your words closely, higher improvises.",
    },
    {
      question: "What are seeds and variations?",
      answer: `A seed steers the model's randomness, so the same seed and settings give a similar image, though Gemini can still vary it. Each run makes 1 to ${ART_MAX_VARIATIONS} variations with different seeds; lock a seed to explore small changes to the prompt or sliders around one result.`,
    },
    {
      question: "What does the reference image do?",
      answer:
        "It's sent to Gemini next to the QR code, so its colors, shapes or logo can carry over into the artwork. It's resized to 512 pixels in your browser first. Only images you upload are accepted, never links.",
    },
    {
      question: "Can I print it large?",
      answer:
        "Images are 1024 × 1024 pixels, about 8.7 cm (3.4 in) at 300 dpi. The print-size download is 2048 × 2048 pixels, resampled in your browser and checked to scan again before it saves, for about 17 cm (6.8 in) at 300 dpi. It doesn't add detail. For any size, the vector Logo QR and Image QR modes in the playground export SVG, PDF and EPS.",
    },
    {
      question: "What can I encode?",
      answer: `Any link or text up to ${ART_TEXT_MAX_LENGTH} characters. Shorter content produces fewer, larger modules, which gives cleaner artwork and more reliable scans.`,
    },
    {
      question: "Which AI model is used?",
      answer: `Google's Gemini image model (Nano Banana 2.1), with ${AI_ART_PRESETS.length} style presets. QRdx draws a plain black-and-white QR code on the server, Gemini repaints it as your scene, and QRdx's own scan check and Image QR blend make sure the result decodes.`,
    },
    {
      question: "Does QRdx store my prompt or image?",
      answer:
        "QRdx doesn't save your prompt, reference image or the generated images; it only counts your credits. The prompt, the QR code image and any reference image are sent through Vercel AI Gateway to Google's Gemini image model to create the artwork, and the result comes straight back to your browser, so download the ones you want to keep.",
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
