import type { Metadata, Viewport } from "next";
import { lang } from "next/root-params";
import { getTranslations } from "next-intl/server";
import { RootDocument } from "@/components/root-document";
import {
  DEFAULT_LOCALE,
  LOCALE_INFO,
  LOCALE_SEGMENTS,
  localeFromSegment,
} from "@/lib/i18n/config";
import { rootMetadata, rootViewport } from "@/lib/root-metadata";
import { buildTimeParams } from "@/lib/static-params";

// The root layout for translated public pages (lib/i18n/localized-paths.json).
// Every locale is prerendered in builds, English included: next.config.ts
// rewrites /pricing to /en/pricing, and /en/... redirects to the unprefixed
// URL. Anything else in the first segment is a 404 from the pages
// (lib/static-params.ts: dev lists no params, so dynamic params stay on).
export function generateStaticParams() {
  return buildTimeParams(() =>
    LOCALE_SEGMENTS.map((segment) => ({ lang: segment })),
  );
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
  return <RootDocument messages={["home.editor"]}>{children}</RootDocument>;
}
