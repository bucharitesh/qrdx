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

// The root layout for translated public pages
// (packages/i18n/localized-paths.json). Builds prerender them in English: next.config.ts rewrites /pricing to
// /en/pricing, and /en/... redirects to the unprefixed URL. The other
// languages render on their first request and are cached from then on
// (lib/i18n/static-params.ts). Anything else in the first segment is a 404
// from the pages (lib/static-params.ts: dynamic params stay on).
export function generateStaticParams() {
  return localeParams();
}

/**
 * The page's locale. A first segment that isn't one renders in English:
 * the pages answer 404 for it (lib/i18n/server.ts), and app/[lang]/
 * not-found.tsx shows inside this layout.
 */
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
    <RootDocument
      messages={["home.editor", "editor.scanScore", "editor.connections"]}
    >
      {children}
      {/* Remembers a translated page's language for the app (after hydration). */}
      <RememberLocale />
    </RootDocument>
  );
}
