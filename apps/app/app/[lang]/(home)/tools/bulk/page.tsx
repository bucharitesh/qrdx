import { MAX_BULK_TOOL_ROWS } from "@repo/config";
import { ArrowRight2, TickCircle } from "iconsax-reactjs";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ClientMessages } from "@/components/i18n/client-messages";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { BrowserFrame } from "@/components/mockups/browser-frame";
import { LoopVideo } from "@/components/mockups/loop-video";
import { loopVideos } from "@/components/mockups/visuals";
import { BulkGenerator } from "@/components/sections/tools/bulk-generator";
import { FaqList } from "@/components/sections/tools/faq-list";
import { ToolHero } from "@/components/sections/tools/tool-hero";
import { localizedMetadata } from "@/lib/i18n/metadata";
import { requireLocale } from "@/lib/i18n/server";

const rows = MAX_BULK_TOOL_ROWS;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await requireLocale();
  const t = await getTranslations({ locale, namespace: "tools.bulk" });
  return localizedMetadata({
    locale,
    path: "/tools/bulk",
    title: t("metaTitle"),
    description: t("metaDescription", { rows }),
    ownOgImage: true,
  });
}

const STEPS = ["prepare", "map", "style", "download"] as const;
const FAQS = [
  "upload",
  "howMany",
  "row",
  "excel",
  "static",
  "names",
  "code",
] as const;

export default async function BulkPage() {
  const locale = await requireLocale();
  const [t, common] = await Promise.all([
    getTranslations({ locale, namespace: "tools.bulk" }),
    getTranslations({ locale, namespace: "common" }),
  ]);
  const faqs = FAQS.map((key) => ({
    question: t(`faq.${key}Question`),
    answer:
      key === "howMany"
        ? t("faq.howManyAnswer", { rows })
        : t(`faq.${key}Answer`),
  }));
  return (
    <main className="flex flex-col divide-y divide-border min-h-screen w-full">
      <ToolHero
        pattern="rain"
        crumbs={[
          { name: common("home"), path: "/" },
          { name: common("tools"), path: "/tools" },
          { name: t("crumb"), path: "/tools/bulk" },
        ]}
        title={t("title")}
        intro={[t("intro1"), t("intro2")]}
      >
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <ul className="contents">
            {[
              t("facts.rows", { rows }),
              t("facts.styled"),
              t("facts.svg"),
              t("facts.browser"),
            ].map((fact) => (
              <li key={fact} className="inline-flex items-center gap-1.5">
                <TickCircle aria-hidden className="size-3.5" />
                {fact}
              </li>
            ))}
          </ul>
          {(
            [
              ["/docs/developers/cli#many-codes-from-a-csv", t("cliLink")],
              ["/qr-code-api", t("apiLink")],
            ] as const
          ).map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="inline-flex items-center gap-1 font-medium text-foreground/80 underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              {label}
              <ArrowRight2 aria-hidden className="size-3.5" />
            </Link>
          ))}
        </div>
      </ToolHero>

      <section aria-label={t("toolLabel")} className="w-full px-10 py-10">
        <ClientMessages
          namespaces={["tools.bulk.generator", "editor.connections"]}
        >
          <BulkGenerator />
        </ClientMessages>
      </section>

      <section className="w-full px-10 py-10 flex flex-col gap-6">
        <h2 className="text-2xl font-medium tracking-tighter">
          {t("howTitle")}
        </h2>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <li
              key={step}
              className="flex flex-col gap-2 rounded-xl border border-border bg-card p-5 shadow-sm"
            >
              <span className="grid size-7 place-items-center rounded-md border bg-muted/40 font-mono text-xs text-foreground/80">
                {index + 1}
              </span>
              <h3 className="mt-1 font-medium">{t(`steps.${step}.title`)}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t(`steps.${step}.body`)}
              </p>
            </li>
          ))}
        </ol>
        <BrowserFrame
          url="qrdx.dev/tools/bulk"
          className="mx-auto w-full max-w-4xl"
        >
          <LoopVideo {...loopVideos.bulk} />
        </BrowserFrame>
      </section>

      <FaqList title={t("faqTitle")} faqs={faqs} />
    </main>
  );
}
