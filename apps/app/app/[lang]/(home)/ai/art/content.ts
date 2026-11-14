// The /ai/art page's step lists and plan allowances, in English. Translated
// through lib/i18n/content-sources.ts.
import { Brush2, DocumentDownload, GalleryAdd } from "iconsax-reactjs";
import type { AIArtAllowances } from "@/components/sections/ai-art/ai-art-studio";
import { ART_MODEL_LABEL, ART_MODEL_MAKER } from "@/lib/ai/art-models";
import { PLAN_LIMITS } from "@/lib/plans";

const allowance = (value: number) => (Number.isFinite(value) ? value : null);

export const ALLOWANCES: AIArtAllowances = {
  free: allowance(PLAN_LIMITS.free.aiArtPerMonth),
  pro: allowance(PLAN_LIMITS.pro.aiArtPerMonth),
  business: allowance(PLAN_LIMITS.business.aiArtPerMonth),
};

export const STEPS = [
  {
    title: "A plain QR code",
    description:
      "QRdx draws your link as a black-and-white QR code with the highest error correction (H) and a wide quiet zone. An optional reference image, such as a logo or a palette, goes along with it.",
  },
  {
    title: `Repainted by ${ART_MODEL_MAKER}`,
    description: `${ART_MODEL_LABEL} repaints the code as your scene, told to keep the module grid, the corner eyes and the quiet zone. QR visibility sets how strongly it favors the code.`,
  },
  {
    title: "Verified to scan",
    description:
      "QRdx decodes every image on the server. If the model's version doesn't scan, QRdx strengthens its corner eyes, border and modules only as much as it takes, redrawing it as Image QR only as a last resort, and nothing that fails is delivered or charged.",
  },
];

export const VECTOR_STEPS = [
  {
    icon: GalleryAdd,
    title: "Upload a logo or photo",
    description:
      "Open Art in the playground and pick Logo QR or Image QR. The picture is sampled in your browser.",
  },
  {
    icon: Brush2,
    title: "Tune the blend",
    description:
      "Set how strongly the picture shows, then style the code: patterns, eyes, colors and frames.",
  },
  {
    icon: DocumentDownload,
    title: "Export as vector",
    description:
      "Download SVG, PDF or EPS that stays sharp at any print size, and test it with a phone camera.",
  },
];
