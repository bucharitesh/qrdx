import { Briefcase, Ruler, Verify } from "iconsax-reactjs";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { HubPage } from "@/app/[lang]/(home)/qr-codes-for/_components/hub-page";
import { localizedMetadata } from "@/lib/i18n/metadata";
import { requireLocale } from "@/lib/i18n/server";
import { industries, placements } from "@/lib/seo-content";
import { localizedCollections } from "@/lib/seo-content/localized";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await requireLocale();
  const t = await getTranslations({
    locale,
    namespace: "seoTopics.placements",
  });
  return localizedMetadata({
    locale,
    path: placements.basePath,
    title: t("metaTitle"),
    description: t("metaDescription", { count: placements.items.length - 5 }),
    ownOgImage: true,
  });
}

export default async function PlacementsHubPage() {
  const locale = await requireLocale();
  const [t, collections] = await Promise.all([
    getTranslations({ locale, namespace: "seoTopics.placements" }),
    localizedCollections(locale),
  ]);
  return (
    <HubPage
      collection={collections.placements}
      title={t("title")}
      intro={[t("intro1"), t("intro2")]}
      links={[
        {
          href: "/qr-codes-for",
          title: t("industriesTitle"),
          description: t("industriesDescription", {
            count: industries.items.length - 4,
          }),
          icon: Briefcase,
        },
        {
          href: "/tools/print-size",
          title: t("printTitle"),
          description: t("printDescription"),
          icon: Ruler,
        },
        {
          href: "/tools/scan-checker",
          title: t("checkerTitle"),
          description: t("checkerDescription"),
          icon: Verify,
        },
      ]}
      faqs={[
        { question: t("faq.sizeQuestion"), answer: t("faq.sizeAnswer") },
        { question: t("faq.failQuestion"), answer: t("faq.failAnswer") },
        { question: t("faq.formatQuestion"), answer: t("faq.formatAnswer") },
      ]}
    />
  );
}
