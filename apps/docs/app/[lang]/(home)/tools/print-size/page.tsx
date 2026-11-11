import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ClientMessages } from "@/components/i18n/client-messages";
import { LocaleLink } from "@/components/i18n/locale-link";
import { MockupImage } from "@/components/mockups/mockup-image";
import { useCaseImages } from "@/components/mockups/visuals";
import { PrintSizePlacements } from "@/components/sections/page-codes/page-code-sections";
import { FaqList } from "@/components/sections/tools/faq-list";
import { PrintSizeCalculator } from "@/components/sections/tools/print-size-calculator";
import { ToolHero } from "@/components/sections/tools/tool-hero";
import { localizedMetadata } from "@/lib/i18n/metadata";
import { requireLocale } from "@/lib/i18n/server";
import { playgroundHref } from "@/lib/playground-links";
import {
  DISTANCE_TO_SIZE_RATIO,
  MIN_MODULE_MM,
  QUIET_ZONE_MODULES,
  REFERENCE_MODULES,
} from "@/lib/print-size";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await requireLocale();
  const t = await getTranslations({ locale, namespace: "tools.printSize" });
  return localizedMetadata({
    locale,
    path: "/tools/print-size",
    title: t("metaTitle"),
    description: t("metaDescription"),
    ownOgImage: true,
  });
}

const LINK =
  "font-medium text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground";

export default async function PrintSizePage() {
  const locale = await requireLocale();
  const [t, common] = await Promise.all([
    getTranslations({ locale, namespace: "tools.printSize" }),
    getTranslations({ locale, namespace: "common" }),
  ]);
  const faqs = [
    {
      question: t("faq.minimumQuestion"),
      answer: t("faq.minimumAnswer", { minimum: MIN_MODULE_MM }),
    },
    { question: t("faq.ruleQuestion"), answer: t("faq.ruleAnswer") },
    { question: t("faq.logoQuestion"), answer: t("faq.logoAnswer") },
    {
      question: t("faq.quietQuestion"),
      answer: t("faq.quietAnswer", { quiet: QUIET_ZONE_MODULES }),
    },
    {
      question: t("faq.resolutionQuestion"),
      answer: t("faq.resolutionAnswer"),
    },
  ];
  return (
    <main className="flex flex-col divide-y divide-border min-h-screen w-full">
      <ToolHero
        pattern="ramp"
        crumbs={[
          { name: common("home"), path: "/" },
          { name: common("tools"), path: "/tools" },
          { name: t("crumb"), path: "/tools/print-size" },
        ]}
        title={t("title")}
        intro={[t("intro1"), t("intro2")]}
      />

      <section aria-label={t("toolLabel")} className="w-full px-10 py-10">
        <ClientMessages namespaces={["tools.printSize.calculator"]}>
          <PrintSizeCalculator />
        </ClientMessages>
      </section>

      <section className="w-full px-10 py-10 grid gap-8 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h2 className="text-2xl font-medium tracking-tighter">
            {t("howTitle")}
          </h2>
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-muted-foreground leading-relaxed">
            <li>{t("how1")}</li>
            <li>
              {t("how2", {
                ratio: DISTANCE_TO_SIZE_RATIO,
                reference: REFERENCE_MODULES,
                divisor: DISTANCE_TO_SIZE_RATIO * REFERENCE_MODULES,
                minimum: MIN_MODULE_MM,
              })}
            </li>
            <li>{t("how3", { quiet: QUIET_ZONE_MODULES })}</li>
          </ol>
        </div>
        <div className="flex flex-col gap-3">
          <h2 className="text-2xl font-medium tracking-tighter">
            {t("tipsTitle")}
          </h2>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-muted-foreground leading-relaxed">
            <li>{t("tip1")}</li>
            <li>{t("tip2")}</li>
            <li>{t("tip3")}</li>
            <li>
              {t.rich("tip4", {
                generators: (chunks) => (
                  <LocaleLink href="/qr-code-generator" className={LINK}>
                    {chunks}
                  </LocaleLink>
                ),
                editor: (chunks) => (
                  <LocaleLink href={playgroundHref()} className={LINK}>
                    {chunks}
                  </LocaleLink>
                ),
              })}
            </li>
          </ul>
          <MockupImage
            {...useCaseImages.busStopPoster}
            sizes="(min-width: 1280px) 600px, (min-width: 768px) 50vw, 100vw"
            className="mt-3"
          />
        </div>
      </section>

      <PrintSizePlacements />

      <FaqList title={t("faqTitle")} faqs={faqs} />
    </main>
  );
}
