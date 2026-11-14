// Maps an English path to the current language's URL. No "use client": it
// works in client components and in synchronous server components alike
// (next-intl's useLocale reads the page's locale in both), so plain <a>
// links on translated pages can keep the language too. Async server
// components use localizeHref(href, await getLocale()) instead.
import { useLocale } from "next-intl";
import { useCallback } from "react";
import { isLocale } from "./config";
import { localizeHref } from "./paths";

/** `(href) => href in this page's language` (lib/i18n/paths.ts). */
export function useLocalizeHref(): (href: string) => string {
  const locale = useLocale();
  return useCallback(
    (href: string) => (isLocale(locale) ? localizeHref(href, locale) : href),
    [locale],
  );
}
