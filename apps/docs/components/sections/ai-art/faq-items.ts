// The /ai/art FAQ in English, from the plan allowances and the art config.
// Translated through lib/i18n/content-sources.ts; ./ai-art-faq.tsx renders it.
import {
  ART_MODEL_LABEL,
  ART_MODEL_NAME,
  ART_SUPPORTS_SEED,
} from "@/lib/ai/art-models";
import type { AIArtAllowances } from "./ai-art-studio";
import { ART_MAX_VARIATIONS, ART_TEXT_MAX_LENGTH } from "./config";
import { AI_ART_PRESET_COUNT } from "./preset-meta";

const count = (value: number | null) =>
  value === null ? "unlimited" : String(value);

/** English; translated through lib/i18n/content-sources.ts (the page's allowances). */
export function faqItems(allowances: AIArtAllowances) {
  return [
    {
      question: "Will the QR art actually scan?",
      answer:
        "Every image you receive has been decoded back to your exact content on our server, both as it is and through a simulated phone camera (smaller, blurred and lower in contrast). The model starts from a QR code with the highest error correction level (H) and is told to keep its grid. If its image doesn't pass, QRdx strengthens the corner eyes, the border and then the modules of that image only as far as it takes to scan, and redraws it as an Image QR code only as a last resort. An image that still fails isn't delivered and uses no credit. Your browser then scores each variation and picks the best. Still test the final image with a phone camera before printing it.",
    },
    {
      question: "How many images can I make?",
      answer: `Each delivered image uses one AI art credit; the print-size download is free. Free accounts get ${count(allowances.free)} credits a month, Pro ${count(allowances.pro)} and Business ${count(allowances.business)}, shared by everyone in the team. Credits reset on the first of each month (UTC), and there is also a safety limit of 25 images per person per day. If a generation fails or doesn't pass the scan check, no credit is used.`,
    },
    {
      question: "Do I need an account?",
      answer: `Yes. Each image is a paid call to ${ART_MODEL_LABEL}, so you need to sign in. AI art credits are separate from AI theme generation.`,
    },
    {
      question: "Can I change the link after printing?",
      answer:
        "No. The content is part of the artwork, so AI art codes are static. For a destination you can edit later, with scan analytics, create a dynamic code in your dashboard and use its short link as the content of your AI art code.",
    },
    {
      question: "What do QR visibility and creativity do?",
      answer:
        "QR visibility sets how strongly the model is asked to favor the code: higher keeps the modules close to black and white, lower lets the scene's light and shadow form them. It also sets how far QRdx may change the image to make it scan. At 50 and below, an image that scans is delivered as it is; otherwise QRdx strengthens the corner eyes and the border, then the modules, only as far as needed. Below 50 it stops sooner rather than cover the scene, so a run can fail (using no credit). Above 50 the code is strengthened even when the image already scans. Creativity sets how freely the model interprets your prompt: lower follows your words closely, higher improvises.",
    },
    ART_SUPPORTS_SEED
      ? {
          question: "What are seeds and variations?",
          answer: `A seed steers the model's randomness, so the same seed and settings give a similar image, though the model can still vary it. Each run makes 1 to ${ART_MAX_VARIATIONS} variations with different seeds; lock a seed to explore small changes to the prompt or sliders around one result.`,
        }
      : {
          question: "What are variations?",
          answer: `Each run makes 1 to ${ART_MAX_VARIATIONS} variations, each its own image and credit. ${ART_MODEL_NAME} doesn't take a seed, so the same prompt and settings give a different image every time: download the ones you want to keep.`,
        },
    {
      question: "What does the reference image do?",
      answer:
        "It's sent to the model next to the QR code, so its colors, shapes or logo can carry over into the artwork. It's resized to 512 pixels in your browser first. Only images you upload are accepted, never links.",
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
      answer: `${ART_MODEL_LABEL}, through Vercel AI Gateway, with ${AI_ART_PRESET_COUNT} style presets. QRdx draws a plain black-and-white QR code on the server, the model repaints it as your scene, and QRdx's own scan check makes sure the result decodes, strengthening the code only as much as it needs.`,
    },
    {
      question: "Does QRdx store my prompt or image?",
      answer: `QRdx doesn't save your prompt, reference image or the generated images; it only counts your credits. The prompt, the QR code image and any reference image are sent through Vercel AI Gateway to ${ART_MODEL_LABEL} to create the artwork, and the result comes straight back to your browser, so download the ones you want to keep.`,
    },
  ];
}
