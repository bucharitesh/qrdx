import { Button } from "@repo/design-system/components/ui/button";
import {
  ArrowRight,
  Brush2,
  DocumentDownload,
  GalleryAdd,
} from "iconsax-reactjs";
import type { Metadata } from "next";
import Link from "next/link";
import { AsciiField } from "@/components/fx";
import { AIArtComingSoon } from "@/components/sections/ai-art/ai-art-coming-soon";
import { AIArtFAQ } from "@/components/sections/ai-art/ai-art-faq";
import {
  type AIArtAllowances,
  AIArtStudio,
} from "@/components/sections/ai-art/ai-art-studio";
import { ART_PLAYGROUND_HREF } from "@/components/sections/ai-art/config";
import { AI_ART_PRESETS } from "@/components/sections/ai-art/presets";
import { VectorArtExamples } from "@/components/sections/ai-art/vector-art-examples";
import { isArtConfigured } from "@/lib/ai/art";
import { createMetadata } from "@/lib/metadata";
import { PLAN_LIMITS } from "@/lib/plans";

export const metadata: Metadata = createMetadata(
  isArtConfigured
    ? {
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
      }
    : {
        title: "QR Code Art: Logo QR and Image QR",
        description:
          "Blend your logo or a photo into a scannable vector QR code, free in the QRdx playground, and export SVG, PDF or EPS. AI-painted QR art is coming soon.",
        path: "/ai/art",
        // The AI generator isn't live here, so keep it out of search.
        robots: { index: false },
      },
);

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

const VECTOR_STEPS = [
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

function NumberedSteps({
  steps,
}: {
  steps: { title: string; description: string }[];
}) {
  return (
    <ol className="grid gap-6 md:grid-cols-3">
      {steps.map((step, index) => (
        <li className="flex flex-col gap-2" key={step.title}>
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {String(index + 1).padStart(2, "0")}
          </span>
          <h3 className="font-medium tracking-tight">{step.title}</h3>
          <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
            {step.description}
          </p>
        </li>
      ))}
    </ol>
  );
}

function VectorArtSection({ lead }: { lead: boolean }) {
  return (
    <section
      aria-labelledby="vector-art"
      className="w-full px-6 py-14 md:px-12 md:py-16"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex max-w-2xl flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {lead ? "Available now, free" : "No AI needed"}
            </p>
            <h2
              className="text-2xl font-semibold tracking-tight text-balance md:text-3xl"
              id="vector-art"
            >
              {lead
                ? "Logo QR and Image QR"
                : "Want a guaranteed-scannable vector code?"}
            </h2>
            <p className="text-pretty text-muted-foreground">
              Blend a logo or photo into the code itself. It's drawn as vectors,
              keeps the patterns scanners rely on solid, and needs no credits.
            </p>
          </div>
          {!lead && (
            <Button asChild className="w-fit" variant="outline">
              <Link href={ART_PLAYGROUND_HREF}>
                Open the Art section
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          )}
        </div>
        <VectorArtExamples />
        {lead && (
          <div className="grid gap-6 border-t pt-8 md:grid-cols-3">
            {VECTOR_STEPS.map((step) => (
              <div className="flex gap-3" key={step.title}>
                <span className="grid size-9 shrink-0 place-items-center rounded-full border bg-muted/40">
                  <step.icon
                    aria-hidden
                    className="size-4 text-foreground/80"
                  />
                </span>
                <div className="flex flex-col gap-1">
                  <h3 className="text-sm font-medium tracking-tight">
                    {step.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default function AIArtPage() {
  return (
    <main className="divide-border flex w-full flex-col items-center justify-center divide-y">
      <section className="relative w-full overflow-hidden">
        {/* Kept off the middle so the headline stays crisp. */}
        <AsciiField
          className="opacity-60 [mask-image:radial-gradient(ellipse_45%_60%_at_50%_50%,transparent_35%,black_100%)]"
          variant="qr"
        />
        <div className="relative mx-auto flex max-w-3xl flex-col items-center gap-4 px-6 pt-16 pb-16 text-center md:pt-24 md:pb-20">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            QR art
          </p>
          <h1 className="max-w-2xl text-3xl font-semibold tracking-tight text-balance md:text-5xl">
            Turn any link into scannable QR art
          </h1>
          {isArtConfigured ? (
            <p className="max-w-xl text-pretty text-muted-foreground md:text-lg">
              Pick one of {AI_ART_PRESETS.length} styles or describe your own
              scene, and an image model paints it around your QR code. Sign in
              to generate: free accounts get {PLAN_LIMITS.free.aiArtPerMonth}{" "}
              images a month, Pro {PLAN_LIMITS.pro.aiArtPerMonth} and Business{" "}
              {PLAN_LIMITS.business.aiArtPerMonth} shared by the team.
            </p>
          ) : (
            <>
              <p className="max-w-xl text-pretty text-muted-foreground md:text-lg">
                Blend your logo or a photo into a vector QR code that still
                scans, free in the playground. AI-painted artwork is coming
                soon.
              </p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <Button asChild>
                  <Link href={ART_PLAYGROUND_HREF}>
                    Make QR art
                    <ArrowRight aria-hidden />
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <a href="#vector-art">See examples</a>
                </Button>
              </div>
            </>
          )}
        </div>
      </section>

      {isArtConfigured ? (
        <>
          <section className="w-full px-6 py-12 md:px-12 md:py-16">
            <div className="mx-auto max-w-5xl">
              <AIArtStudio allowances={ALLOWANCES} configured />
            </div>
          </section>
          <VectorArtSection lead={false} />
          <section
            aria-labelledby="how-it-works"
            className="w-full px-6 py-14 md:px-12 md:py-16"
          >
            <div className="mx-auto flex max-w-5xl flex-col gap-8">
              <h2
                className="text-2xl font-semibold tracking-tight text-balance md:text-3xl"
                id="how-it-works"
              >
                How AI QR art works
              </h2>
              <NumberedSteps steps={STEPS} />
            </div>
          </section>
          <AIArtFAQ allowances={ALLOWANCES} />
        </>
      ) : (
        <>
          <VectorArtSection lead />
          <section className="w-full px-6 py-14 md:px-12 md:py-16">
            <AIArtComingSoon />
          </section>
        </>
      )}
    </main>
  );
}
