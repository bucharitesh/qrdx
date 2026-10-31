import type { Metadata } from "next";
import Link from "next/link";
import { AIArtFAQ } from "@/components/sections/ai-art/ai-art-faq";
import {
  type AIArtAllowances,
  AIArtStudio,
} from "@/components/sections/ai-art/ai-art-studio";
import { AI_ART_PRESETS } from "@/components/sections/ai-art/presets";
import { SectionHeader } from "@/components/sections/section-header";
import { isArtConfigured } from "@/lib/ai/art";
import { createMetadata } from "@/lib/metadata";
import { PLAN_LIMITS } from "@/lib/plans";

export const metadata: Metadata = createMetadata({
  title: "AI QR Code Art Generator — Scannable Artistic QR Codes",
  description: `Turn a link into scannable AI artwork: ${AI_ART_PRESETS.length} style presets, up to 4 variations per run, a QR visibility slider and an automatic scan check that picks the best result. Requires sign-in; free accounts get ${PLAN_LIMITS.free.aiArtPerMonth} images a month.`,
  keywords: [
    "ai qr code art",
    "ai qr code art generator",
    "artistic qr code",
    "qr code art",
    "illusion diffusion qr code",
    "scannable ai qr code",
  ],
  path: "/ai/art",
  // Nothing to offer search visitors when this deployment can't generate.
  ...(!isArtConfigured && { robots: { index: false } }),
});

const allowance = (value: number) => (Number.isFinite(value) ? value : null);

const ALLOWANCES: AIArtAllowances = {
  free: allowance(PLAN_LIMITS.free.aiArtPerMonth),
  pro: allowance(PLAN_LIMITS.pro.aiArtPerMonth),
  business: allowance(PLAN_LIMITS.business.aiArtPerMonth),
};

const STEPS = [
  {
    title: "A plain QR code",
    description:
      "QRdx draws your link as a black-and-white QR code with the highest error correction (H) and a wide quiet zone. An optional reference image is blended in faintly to steer the composition.",
  },
  {
    title: "Painted by an image model",
    description:
      "An image model on fal.ai paints your scene, using the code's light and dark modules as a hidden guide. QR visibility sets how strictly it follows them.",
  },
  {
    title: "Checked in your browser",
    description:
      "QRdx decodes every variation and picks the best scannable one. Upscale it 2× for print, or retry the same seed with a clearer code.",
  },
];

export default function AIArtPage() {
  return (
    <main className="divide-border flex w-full flex-col items-center justify-center divide-y">
      <section className="relative w-full">
        <div className="absolute inset-0 -z-10 h-full w-full [background:radial-gradient(125%_125%_at_50%_10%,var(--background)_40%,#7c3aed_100%)] opacity-60" />
        <div className="flex flex-col items-center justify-center gap-6 px-6 py-20 text-center md:py-28">
          <p className="border-border bg-muted text-muted-foreground flex h-8 items-center gap-2 rounded-full border px-3 text-sm">
            AI QR art
          </p>
          <h1 className="text-secondary-foreground max-w-2xl text-3xl font-semibold tracking-tighter text-balance md:text-4xl lg:text-5xl">
            Turn any link into scannable QR art
          </h1>
          <p className="text-muted-foreground max-w-xl text-base leading-relaxed font-medium tracking-tight text-balance md:text-lg">
            Pick one of {AI_ART_PRESETS.length} styles or describe your own
            scene, and an image model paints it around your QR code. Sign in to
            generate: free accounts get {PLAN_LIMITS.free.aiArtPerMonth} images
            a month, Pro {PLAN_LIMITS.pro.aiArtPerMonth} and Business{" "}
            {PLAN_LIMITS.business.aiArtPerMonth} shared by the team.
          </p>
          <p className="text-muted-foreground text-sm">
            Want a guaranteed-scannable vector code instead? Try{" "}
            <Link className="text-primary hover:underline" href="/playground">
              Logo QR and Image QR
            </Link>{" "}
            in the playground, no AI or credits needed.
          </p>
        </div>
      </section>

      <section className="w-full px-6 py-12 md:px-12 md:py-16">
        <div className="mx-auto max-w-5xl">
          <AIArtStudio allowances={ALLOWANCES} configured={isArtConfigured} />
        </div>
      </section>

      <section className="flex w-full flex-col items-center">
        <SectionHeader>
          <h2 className="text-center text-2xl font-medium tracking-tighter text-balance md:text-3xl">
            How it works
          </h2>
        </SectionHeader>
        <ol className="grid w-full max-w-5xl gap-6 px-6 py-12 md:grid-cols-3 md:px-12">
          {STEPS.map((step, index) => (
            <li className="flex flex-col gap-2" key={step.title}>
              <span className="text-muted-foreground text-sm tabular-nums">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="font-medium">{step.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {step.description}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <AIArtFAQ allowances={ALLOWANCES} />
    </main>
  );
}
