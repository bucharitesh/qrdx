import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ClientMessages } from "@/components/i18n/client-messages";
import { IconTile } from "@/components/sections/tools/cards";
import { FaqList } from "@/components/sections/tools/faq-list";
import { ToolHero } from "@/components/sections/tools/tool-hero";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { TEMPLATE_RULES } from "@/lib/i18n/content-rules";
import { localizeContent } from "@/lib/i18n/content-server";
import { localizedMetadata } from "@/lib/i18n/metadata";
import { requireLocale } from "@/lib/i18n/server";
import { listTemplateDemos } from "@/lib/landing/demo";
import { TEMPLATES_PATH } from "@/lib/landing/demo-paths";
import { listTemplates } from "@/lib/landing/templates";
import { TemplateCard } from "./_components/template-card";
import { TemplateFilter } from "./_components/template-filter";

// Public gallery of every hosted-page template, grouped by page type, each
// with a live demo (/templates/<type>/<id>). Built from the template
// registry; no database.

// Event previews start "a week from today"; rebuild daily.
export const revalidate = 86400;

const demos = listTemplateDemos();

export async function generateMetadata(): Promise<Metadata> {
  const locale = await requireLocale();
  const t = await getTranslations({ locale, namespace: "templates" });
  return localizedMetadata({
    locale,
    path: TEMPLATES_PATH,
    title: t("metaTitle"),
    description: t("metaDescription", { count: demos.length }),
    ownOgImage: true,
  });
}

const FAQS = ["free", "change", "photos", "website", "data"] as const;

export default async function TemplatesPage() {
  const locale = await requireLocale();
  // Names and descriptions of the templates and their variants are
  // translated content; the demo pages themselves stay as written.
  const [t, common, { types, localDemos }] = await Promise.all([
    getTranslations({ locale, namespace: "templates" }),
    getTranslations({ locale, namespace: "common" }),
    localizeContent(
      { types: listTemplates(), localDemos: demos },
      locale,
      TEMPLATE_RULES,
    ),
  ]);
  const domains = isFeatureAvailable("customDomains") ? "yes" : "no";
  const faqs = FAQS.map((key) => ({
    question: t(`faq.${key}Question`),
    answer:
      key === "website"
        ? t("faq.websiteAnswer", { domains })
        : t(`faq.${key}Answer`),
  }));

  return (
    <main className="flex min-h-screen w-full flex-col divide-y divide-border">
      <ToolHero
        crumbs={[
          { name: common("home"), path: "/" },
          { name: t("crumb"), path: TEMPLATES_PATH },
        ]}
        intro={[t("intro", { templates: demos.length, types: types.length })]}
        title={t("title")}
      />

      <ClientMessages namespaces={["templates.filter", "templateDemo"]}>
        <TemplateFilter
          total={demos.length}
          types={types.map((template) => ({
            type: template.type,
            label: template.label,
            count: template.variants.length,
          }))}
        >
          {types.map((template) => {
            const items = localDemos.filter(
              (demo) => demo.template.type === template.type,
            );
            const headingId = `${template.type}-heading`;
            return (
              <section
                aria-labelledby={headingId}
                className="flex w-full scroll-mt-16 flex-col border-b last:border-b-0"
                data-template-section={template.type}
                id={template.type}
                key={template.type}
              >
                <div className="flex items-start gap-3.5 px-10 pt-10 pb-6">
                  <IconTile icon={template.icon} />
                  <div className="min-w-0 flex-1 space-y-1">
                    <h2
                      className="text-xl font-medium tracking-tight text-balance"
                      id={headingId}
                    >
                      {template.label}
                    </h2>
                    <p className="text-muted-foreground text-sm text-pretty">
                      {template.description}
                    </p>
                  </div>
                  <span className="text-muted-foreground hidden shrink-0 pt-1 text-xs tabular-nums sm:block">
                    {t("count", { count: items.length })}
                  </span>
                </div>
                {/* A swipeable row on phones, a grid from sm. */}
                <div className="flex scroll-px-10 snap-x snap-mandatory gap-4 overflow-x-auto px-10 pt-1 pb-10 [scrollbar-width:none] sm:grid sm:snap-none sm:grid-cols-2 sm:gap-x-6 sm:gap-y-10 sm:overflow-visible lg:grid-cols-3 lg:gap-x-8">
                  {items.map((demo) => (
                    <TemplateCard
                      className="w-[15.5rem] shrink-0 snap-start sm:w-auto"
                      demo={demo}
                      key={demo.path}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </TemplateFilter>
      </ClientMessages>

      <FaqList faqs={faqs} title={t("faqTitle")} />
    </main>
  );
}
