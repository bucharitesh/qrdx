import { Button } from "@repo/design-system/components/ui/button";
import { ArrowRight } from "iconsax-reactjs";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AsciiField } from "@/components/fx";
import { ClientMessages } from "@/components/i18n/client-messages";
import { LocaleLink } from "@/components/i18n/locale-link";
import { AIArtComingSoon } from "@/components/sections/ai-art/ai-art-coming-soon";
import { AIArtFAQ } from "@/components/sections/ai-art/ai-art-faq";
import { AIArtStudio } from "@/components/sections/ai-art/ai-art-studio";
import { ART_PLAYGROUND_HREF } from "@/components/sections/ai-art/config";
import { AI_ART_PRESET_COUNT } from "@/components/sections/ai-art/preset-meta";
import { VectorArtExamples } from "@/components/sections/ai-art/vector-art-examples";
import { isArtConfigured } from "@/lib/ai/art";
import { ART_MODEL_LABEL, ART_MODEL_NAME } from "@/lib/ai/art-models";
import { localizeContent } from "@/lib/i18n/content-server";
import { localizedMetadata } from "@/lib/i18n/metadata";
import { AI_ART_STUDIO_NAMESPACES } from "@/lib/i18n/playground";
import { requireLocale } from "@/lib/i18n/server";
import { PLAN_LIMITS } from "@/lib/plans";
import { ALLOWANCES, STEPS, VECTOR_STEPS } from "./content";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await requireLocale();
  const t = await getTranslations({ locale, namespace: "aiArt" });
  return localizedMetadata(
    isArtConfigured
      ? {
          locale,
          path: "/ai/art",
          title: t("metaTitle"),
          description: t("metaDescription", {
            model: ART_MODEL_LABEL,
            styles: AI_ART_PRESET_COUNT,
            free: PLAN_LIMITS.free.aiArtPerMonth,
          }),
          keywords: [
            "ai qr code art",
            "ai qr code art generator",
            "artistic qr code",
            "qr code art",
            `${ART_MODEL_NAME.toLowerCase()} qr code art`,
            "scannable ai qr code",
          ],
          ownOgImage: true,
        }
      : {
          locale,
          path: "/ai/art",
          title: t("metaTitleSoon"),
          description: t("metaDescriptionSoon"),
          ownOgImage: true,
          // The AI generator isn't live here, so keep it out of search.
          robots: { index: false },
        },
  );
}

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

type Translate = Awaited<ReturnType<typeof getTranslations<"aiArt">>>;

function VectorArtSection({
  lead,
  t,
  steps,
}: {
  lead: boolean;
  t: Translate;
  steps: typeof VECTOR_STEPS;
}) {
  return (
    <section
      aria-labelledby="vector-art"
      className="w-full px-10 py-14 md:px-12 md:py-16"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex max-w-2xl flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t(lead ? "vectorEyebrowLead" : "vectorEyebrow")}
            </p>
            <h2
              className="text-2xl font-semibold tracking-tight text-balance md:text-3xl"
              id="vector-art"
            >
              {t(lead ? "vectorTitleLead" : "vectorTitle")}
            </h2>
            <p className="text-pretty text-muted-foreground">
              {t("vectorDescription")}
            </p>
          </div>
          {!lead && (
            <Button asChild className="w-fit" variant="outline">
              <LocaleLink href={ART_PLAYGROUND_HREF}>
                {t("openArt")}
                <ArrowRight aria-hidden />
              </LocaleLink>
            </Button>
          )}
        </div>
        <VectorArtExamples />
        {lead && (
          <div className="grid gap-6 border-t pt-8 md:grid-cols-3">
            {steps.map((step) => (
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

export default async function AIArtPage() {
  const locale = await requireLocale();
  const [t, content] = await Promise.all([
    getTranslations({ locale, namespace: "aiArt" }),
    localizeContent({ steps: STEPS, vectorSteps: VECTOR_STEPS }, locale),
  ]);
  return (
    <main className="divide-border flex w-full flex-col items-center justify-center divide-y">
      <section className="relative w-full overflow-hidden">
        {/* Kept off the middle so the headline stays crisp. */}
        <AsciiField
          className="opacity-60 [mask-image:radial-gradient(ellipse_45%_60%_at_50%_50%,transparent_35%,black_100%)]"
          variant="qr"
        />
        <div className="relative mx-auto flex max-w-[50rem] flex-col items-center gap-4 px-10 pt-16 pb-16 text-center md:pt-24 md:pb-20">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t("eyebrow")}
          </p>
          <h1 className="max-w-2xl text-3xl font-semibold tracking-tight text-balance md:text-5xl">
            {t("title")}
          </h1>
          {isArtConfigured ? (
            <p className="max-w-xl text-pretty text-muted-foreground md:text-lg">
              {t("intro", {
                styles: AI_ART_PRESET_COUNT,
                model: ART_MODEL_LABEL,
                free: PLAN_LIMITS.free.aiArtPerMonth,
                pro: PLAN_LIMITS.pro.aiArtPerMonth,
                business: PLAN_LIMITS.business.aiArtPerMonth,
              })}
            </p>
          ) : (
            <>
              <p className="max-w-xl text-pretty text-muted-foreground md:text-lg">
                {t("introSoon")}
              </p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <Button asChild>
                  <LocaleLink href={ART_PLAYGROUND_HREF}>
                    {t("make")}
                    <ArrowRight aria-hidden />
                  </LocaleLink>
                </Button>
                <Button asChild variant="outline">
                  <a href="#vector-art">{t("examples")}</a>
                </Button>
              </div>
            </>
          )}
        </div>
      </section>

      {isArtConfigured ? (
        <>
          <section className="w-full px-10 py-12 md:px-12 md:py-16">
            <div className="mx-auto max-w-5xl">
              <ClientMessages namespaces={AI_ART_STUDIO_NAMESPACES}>
                <AIArtStudio allowances={ALLOWANCES} configured />
              </ClientMessages>
            </div>
          </section>
          <ClientMessages namespaces={["aiArt.vector"]}>
            <VectorArtSection lead={false} t={t} steps={content.vectorSteps} />
          </ClientMessages>
          <section
            aria-labelledby="how-it-works"
            className="w-full px-10 py-14 md:px-12 md:py-16"
          >
            <div className="mx-auto flex max-w-5xl flex-col gap-8">
              <h2
                className="text-2xl font-semibold tracking-tight text-balance md:text-3xl"
                id="how-it-works"
              >
                {t("howTitle")}
              </h2>
              <NumberedSteps steps={content.steps} />
            </div>
          </section>
          <AIArtFAQ allowances={ALLOWANCES} />
        </>
      ) : (
        <>
          <ClientMessages namespaces={["aiArt.vector"]}>
            <VectorArtSection lead t={t} steps={content.vectorSteps} />
          </ClientMessages>
          <section className="w-full px-10 py-14 md:px-12 md:py-16">
            <ClientMessages namespaces={["aiArt.comingSoon"]}>
              <AIArtComingSoon />
            </ClientMessages>
          </section>
        </>
      )}
    </main>
  );
}
