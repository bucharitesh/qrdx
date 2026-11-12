import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ClientMessages } from "@/components/i18n/client-messages";
import { LocaleLink } from "@/components/i18n/locale-link";
import { BrowserFrame } from "@/components/mockups/browser-frame";
import { LoopVideo } from "@/components/mockups/loop-video";
import { loopVideos } from "@/components/mockups/visuals";
import { FaqList } from "@/components/sections/tools/faq-list";
import { ToolHero } from "@/components/sections/tools/tool-hero";
import { localizedMetadata } from "@/lib/i18n/metadata";
import { requireLocale } from "@/lib/i18n/server";
import { playgroundHref } from "@/lib/playground-links";
import { PageScanChecker } from "./page-scan-checker";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await requireLocale();
  const t = await getTranslations({ locale, namespace: "tools.scanChecker" });
  return localizedMetadata({
    locale,
    path: "/tools/scan-checker",
    title: t("metaTitle"),
    description: t("metaDescription"),
    ownOgImage: true,
  });
}

const FAQS = ["upload", "score", "low", "size", "fix"] as const;
const TESTS = ["test1", "test2", "test3", "test4", "test5"] as const;

const LINK =
  "font-medium text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground";

export default async function ScanCheckerPage() {
  const locale = await requireLocale();
  const [t, common] = await Promise.all([
    getTranslations({ locale, namespace: "tools.scanChecker" }),
    getTranslations({ locale, namespace: "common" }),
  ]);
  return (
    <main className="flex flex-col divide-y divide-border min-h-screen w-full">
      <ToolHero
        pattern="scan"
        crumbs={[
          { name: common("home"), path: "/" },
          { name: common("tools"), path: "/tools" },
          { name: t("crumb"), path: "/tools/scan-checker" },
        ]}
        title={t("title")}
        intro={[t("intro1"), t("intro2")]}
      />

      <section aria-label={t("toolLabel")} className="w-full px-10 py-10">
        <ClientMessages
          namespaces={[
            "scanChecker",
            "tools.scanChecker.restyle",
            "editor.scanScore",
          ]}
        >
          <PageScanChecker />
        </ClientMessages>
      </section>

      <section className="w-full px-10 py-10 grid gap-8 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h2 className="text-2xl font-medium tracking-tighter">
            {t("testsTitle")}
          </h2>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-muted-foreground leading-relaxed">
            {TESTS.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-3">
          <h2 className="text-2xl font-medium tracking-tighter">
            {t("designTitle")}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {t.rich("design", {
              editor: (chunks) => (
                <LocaleLink href={playgroundHref()} className={LINK}>
                  {chunks}
                </LocaleLink>
              ),
              size: (chunks) => (
                <LocaleLink href="/tools/print-size" className={LINK}>
                  {chunks}
                </LocaleLink>
              ),
            })}
          </p>
          <BrowserFrame url="qrdx.dev/tools/scan-checker" className="mt-3">
            <LoopVideo {...loopVideos.scanChecker} />
          </BrowserFrame>
        </div>
      </section>

      <FaqList
        title={t("faqTitle")}
        faqs={FAQS.map((key) => ({
          question: t(`faq.${key}Question`),
          answer: t(`faq.${key}Answer`),
        }))}
      />
    </main>
  );
}
