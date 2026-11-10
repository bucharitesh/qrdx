import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { lang } from "next/root-params";
import { getTranslations } from "next-intl/server";
import { RootDocument } from "@/components/root-document";
import {
  LOCALE_INFO,
  LOCALE_SEGMENTS,
  localeFromSegment,
} from "@/lib/i18n/config";
import { rootMetadata, rootViewport } from "@/lib/root-metadata";
import { buildTimeParams } from "@/lib/static-params";

// The root layout for translated public pages (lib/i18n/localized-paths.json).
// Every locale is prerendered in builds, English included: next.config.ts
// rewrites /pricing to /en/pricing, and /en/... redirects to the unprefixed
// URL. Anything else in the first segment is a 404 (lib/static-params.ts:
// dev lists no params, so dynamic params stay on).
export function generateStaticParams() {
  return buildTimeParams(() =>
    LOCALE_SEGMENTS.map((segment) => ({ lang: segment })),
  );
}

/** The page's locale; a 404 for a first segment that isn't one. */
async function rootLocale() {
  const locale = localeFromSegment(await lang());
  if (!locale) notFound();
  return locale;
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
