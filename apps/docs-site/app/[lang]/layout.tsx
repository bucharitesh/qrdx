import type { Metadata, Viewport } from "next";
import { lang } from "next/root-params";
import { getTranslations } from "next-intl/server";
import { RememberLocale } from "@/components/i18n/remember-locale";
import { RootDocument } from "@/components/root-document";
import {
  DEFAULT_LOCALE,
  LOCALE_INFO,
  localeFromSegment,
} from "@/lib/i18n/config";
import { localeParams } from "@/lib/i18n/static-params";
import { rootMetadata, rootViewport } from "@/lib/root-metadata";

// The docs site's root layout. As in the main app (apps/docs/app/[lang]),
// builds prerender English: next.config.ts rewrites /docs to /en/docs. The
// other languages render on their first request and are cached from then
// on (lib/i18n/static-params.ts). Anything else in the first segment is a
// 404 from the pages.
export function generateStaticParams() {
  return localeParams();
}

/** The page's locale; a first segment that isn't one renders in English. */
async function rootLocale() {
  return localeFromSegment(await lang()) ?? DEFAULT_LOCALE;
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await rootLocale();
  const t = await getTranslations({ locale, namespace: "meta" });
  return rootMetadata({
    title: t("siteTitle"),
    description: t("siteDescription"),
    ogLocale: LOCALE_INFO[locale].ogLocale,
  });
}

export const viewport: Viewport = rootViewport;

export default async function Layout({ children }: LayoutProps<"/[lang]">) {
  await rootLocale();
  return (
    <RootDocument>
      {children}
      {/* Remembers a translated page's language for the app (after hydration). */}
      <RememberLocale />
    </RootDocument>
  );
}
