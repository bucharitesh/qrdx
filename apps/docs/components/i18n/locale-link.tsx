"use client";

import type Link from "next/link";
import { useRouter } from "next/navigation";
import { type ComponentProps, useMemo } from "react";
import { isDocsPage, ZoneLink } from "@/components/zone-link";
import { useLocalizeHref } from "@/lib/i18n/use-localize-href";

// Internal links that keep the visitor's language, through ZoneLink: next/link
// for docs pages, a plain <a> into the main app for everything else
// (components/zone-link.tsx). Everything reachable from
// app/[lang] links through these, never next/link or useRouter directly
// (tests/i18n/locale-links.test.ts): on /hi pages a link to /playground goes
// to /hi/playground, and pages that aren't translated keep their English
// URL (lib/i18n/paths.ts). In the signed-in app the language is the
// person's (lib/i18n/app-locale.ts), so its links to public pages follow it.

export { useLocalizeHref } from "@/lib/i18n/use-localize-href";

/**
 * next/link that keeps the visitor's language: on /es pages, a link to
 * /pricing goes to /es/pricing. Pages that aren't translated keep their
 * English URL (lib/i18n/paths.ts).
 */
export function LocaleLink({ href, ...props }: ComponentProps<typeof Link>) {
  const localize = useLocalizeHref();
  return (
    <ZoneLink
      href={typeof href === "string" ? localize(href) : href}
      {...props}
    />
  );
}

type Router = ReturnType<typeof useRouter>;

/**
 * useRouter whose push, replace and prefetch keep the visitor's language.
 * Pages outside the docs load in full from the main app, like ZoneLink's.
 */
export function useLocaleRouter(): Router {
  const router = useRouter();
  const localize = useLocalizeHref();
  return useMemo(
    (): Router => ({
      ...router,
      push: (href, options) => {
        const target = localize(href);
        if (isDocsPage(target)) router.push(target, options);
        else window.location.assign(target);
      },
      replace: (href, options) => {
        const target = localize(href);
        if (isDocsPage(target)) router.replace(target, options);
        else window.location.replace(target);
      },
      prefetch: (href, options) => {
        const target = localize(href);
        if (isDocsPage(target)) router.prefetch(target, options);
      },
    }),
    [router, localize],
  );
}
