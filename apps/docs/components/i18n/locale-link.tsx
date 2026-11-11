"use client";

import Link from "next/link";
import { useLocale } from "next-intl";
import { type ComponentProps, useCallback } from "react";
import { localizeHref } from "@/lib/i18n/paths";

/** Maps an English path to the current language's version, when one exists. */
export function useLocalizeHref(): (href: string) => string {
  const locale = useLocale();
  return useCallback((href: string) => localizeHref(href, locale), [locale]);
}

/**
 * next/link that keeps the visitor's language: on /es pages, a link to
 * /pricing goes to /es/pricing. Pages that aren't translated keep their
 * English URL (lib/i18n/paths.ts).
 */
export function LocaleLink({ href, ...props }: ComponentProps<typeof Link>) {
  const localize = useLocalizeHref();
  return (
    <Link href={typeof href === "string" ? localize(href) : href} {...props} />
  );
}
