import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/config";
import { useLocale } from "next-intl";
import { type ReactNode, use } from "react";
import type { ContentRules } from "@/lib/i18n/content";
import { loadMemory, pickTranslations } from "@/lib/i18n/content-server";
import { ContentTextProvider } from "./content-text";

/**
 * Hands client components the translations of the TypeScript data they
 * display (lib/i18n/content.ts), for useContentText(). Only the strings in
 * `data` are sent. The data must be listed in lib/i18n/content-sources.ts
 * to be translated at all.
 */
export function ClientContent({
  data,
  rules,
  locale: given,
  children,
}: {
  data: unknown;
  rules?: ContentRules;
  /** The page's language by default; pages without one pass it. */
  locale?: Locale;
  children: ReactNode;
}) {
  const pageLocale = useLocale();
  const locale = given ?? pageLocale;
  const translations =
    locale === DEFAULT_LOCALE
      ? NONE
      : pickTranslations(use(loadMemory(locale)), data, rules);
  return (
    <ContentTextProvider translations={translations}>
      {children}
    </ContentTextProvider>
  );
}

const NONE: Record<string, string> = {};
