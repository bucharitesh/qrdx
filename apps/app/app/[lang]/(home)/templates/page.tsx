import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ClientMessages } from "@/components/i18n/client-messages";
import { IconTile } from "@/components/sections/tools/cards";
import { FaqList } from "@/components/sections/tools/faq-list";
import { ToolHero } from "@/components/sections/tools/tool-hero";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { localizedMetadata } from "@/lib/i18n/metadata";
import { requireLocale } from "@/lib/i18n/server";
import { TEMPLATES_PATH } from "@/lib/landing/demo-paths";
import { DeferredCards } from "./_components/deferred-cards";
import { SectionCards } from "./_components/section-cards";
import { TemplateFilter } from "./_components/template-filter";
import { EAGER_CARDS, SECTION_CARDS } from "./_lib/gallery";
import { localizedGallery, TEMPLATE_COUNT } from "./_lib/sections";

// Public gallery of every hosted-page template, grouped by page type, each
// with a live demo (/templates/<type>/<id>). Built from the template
// registry; no database.
//
// Every section, template name and demo link is in the HTML, but only the
// first screen's cards draw their live preview (a page in a phone each, the
// heavy part): the others load theirs as they near the screen
// (_components/deferred-cards.tsx), so the page stays light and static.

// Event previews start "a week from today"; rebuild daily.
export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await requireLocale();
  const t = await getTranslations({ locale, namespace: "templates" });
  return localizedMetadata({
    locale,
    path: TEMPLATES_PATH,
    title: t("metaTitle"),
    description: t("metaDescription", { count: TEMPLATE_COUNT }),
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
    localizedGallery(locale),
  ]);
  const moreLabels = {
    load: t("more.load"),
    loading: t("more.loading"),
    failed: t("more.failed"),
  };
  const sections = types.map((template) => ({
    template,
    items: localDemos.filter((demo) => demo.template.type === template.type),
  }));
  // The first EAGER_CARDS cards, in order, are drawn on the server.
  let left = EAGER_CARDS;
  const eager = sections.map(({ items }) => {
    const count = Math.min(left, items.length);
    left -= count;
    return count;
  });
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
        intro={[t("intro", { templates: TEMPLATE_COUNT, types: types.length })]}
        title={t("title")}
      />

      <ClientMessages namespaces={["templates.filter", "templateDemo"]}>
        <TemplateFilter
          total={TEMPLATE_COUNT}
          types={types.map((template) => ({
            type: template.type,
            label: template.label,
            count: template.variants.length,
          }))}
        >
          {sections.map(({ template, items }, index) => {
            const drawn = eager[index] ?? 0;
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
                <div className={SECTION_CARDS}>
                  <SectionCards demos={items.slice(0, drawn)} locale={locale} />
                  {items.length > drawn && (
                    <DeferredCards
                      cards={items.slice(drawn).map((demo) => ({
                        name: demo.variant.name,
                        description: demo.variant.description,
                        href: demo.path,
                      }))}
                      labels={moreLabels}
                      locale={locale}
                      offset={drawn}
                      type={template.type}
                    />
                  )}
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
