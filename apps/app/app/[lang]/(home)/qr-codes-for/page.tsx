import { Category, Routing2, Signpost } from "iconsax-reactjs";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { localizedMetadata } from "@/lib/i18n/metadata";
import { requireLocale } from "@/lib/i18n/server";
import { industries, placements } from "@/lib/seo-content";
import { localizedCollections } from "@/lib/seo-content/localized";
import { HubPage } from "./_components/hub-page";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await requireLocale();
  const t = await getTranslations({
    locale,
    namespace: "seoTopics.industries",
  });
  return localizedMetadata({
    locale,
    path: industries.basePath,
    title: t("metaTitle"),
    description: t("metaDescription", { count: industries.items.length }),
    ownOgImage: true,
  });
}

export default async function IndustriesHubPage() {
  const locale = await requireLocale();
  const [t, collections] = await Promise.all([
    getTranslations({ locale, namespace: "seoTopics.industries" }),
    localizedCollections(locale),
  ]);
  return (
    <HubPage
      collection={collections.industries}
      title={t("title")}
      intro={[t("intro1"), t("intro2")]}
      links={[
        {
          href: "/qr-codes-on",
          title: t("placementsTitle"),
          description: t("placementsDescription", {
            count: placements.items.length - 4,
          }),
          icon: Signpost,
        },
        {
          href: "/qr-code-generator",
          title: t("generatorsTitle"),
          description: t("generatorsDescription"),
          icon: Category,
        },
        {
          href: "/docs/dynamic-qr-codes",
          title: t("dynamicTitle"),
          description: t("dynamicDescription"),
          icon: Routing2,
        },
      ]}
      faqs={[
        {
          question: t("faq.benefitQuestion"),
          answer: t("faq.benefitAnswer"),
        },
        {
          question: t("faq.staticQuestion"),
          answer: t("faq.staticAnswer"),
        },
        {
          question: t("faq.cancelQuestion"),
          answer: t("faq.cancelAnswer"),
        },
      ]}
    />
  );
}
