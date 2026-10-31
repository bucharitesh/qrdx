import type { Metadata } from "next";
import { AIArtFAQ } from "@/components/sections/ai-art/ai-art-faq";
import { AIArtStudio } from "@/components/sections/ai-art/ai-art-studio";
import { SectionHeader } from "@/components/sections/section-header";
import { isArtConfigured } from "@/lib/ai/art";
import { AI_REQUEST_FREE_TIER_LIMIT } from "@/lib/constants";
import { createMetadata } from "@/lib/metadata";

export const metadata: Metadata = createMetadata({
  title: "AI QR Code Art Generator — Scannable Artistic QR Codes",
  description:
    "Turn a link into scannable AI artwork: describe a style, set the creativity and QRdx checks that the image still scans. Requires sign-in; each image uses one AI credit.",
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

const STEPS = [
  {
    title: "A plain QR code",
    description:
      "QRdx draws your link as a black-and-white QR code with the highest error correction (H) and a wide quiet zone.",
  },
  {
    title: "Painted by an image model",
    description:
      "An image model on fal.ai paints your scene, using the code's light and dark modules as a hidden guide.",
  },
  {
    title: "Checked in your browser",
    description:
      "QRdx tries to decode the result. If it can't, lower the creativity and retry with the same seed.",
  },
];

export default function AIArtPage() {
  return (
    <main className="flex w-full flex-col items-center justify-center divide-y divide-border">
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
            Describe a scene and an image model paints it around your QR code.
            Sign in to generate: each image uses one AI credit, and free
            accounts include {AI_REQUEST_FREE_TIER_LIMIT}.
          </p>
        </div>
      </section>

      <section className="w-full px-6 py-12 md:px-12 md:py-16">
        <div className="mx-auto max-w-5xl">
          <AIArtStudio configured={isArtConfigured} />
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
            <li key={step.title} className="flex flex-col gap-2">
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

      <AIArtFAQ />
    </main>
  );
}
