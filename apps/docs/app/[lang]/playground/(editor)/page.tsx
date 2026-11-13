import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LazyEditor as Editor } from "@/components/lazy-editor";
import { PLAYGROUND_KEYWORDS } from "@/components/playground/playground-metadata";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";
import { localizedMetadata } from "@/lib/i18n/metadata";
import { requireLocale } from "@/lib/i18n/server";

// The home page owns "QR code generator"; the playground is the designer.
export async function generateMetadata(): Promise<Metadata> {
  const locale = await requireLocale();
  const t = await getTranslations({ locale, namespace: "playground" });
  return localizedMetadata({
    locale,
    path: "/playground",
    title: t("metaTitle"),
    description: t("metaDescription"),
    ...(locale === DEFAULT_LOCALE && { keywords: PLAYGROUND_KEYWORDS }),
    ownOgImage: true,
  });
}

// The bare playground is static: one cached page per language, served from
// the CDN. Shared /playground/<themeId> links render per request in
// app/(app)/playground/[...qrId]. The crawlable intro under the editor is
// in ./layout.tsx.
export default async function PlaygroundPage() {
  await requireLocale();
  return <Editor themePromise={Promise.resolve(null)} />;
}
