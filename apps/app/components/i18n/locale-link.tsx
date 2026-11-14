"use client";

import { isDocsPagePath } from "@repo/i18n/docs";
import { isSitePagePath } from "@repo/next-config/site-zone";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ComponentProps, useMemo } from "react";
import { useLocalizeHref } from "@/lib/i18n/use-localize-href";

// Internal links that keep the visitor's language. Everything reachable from
// app/[lang] links through these, never next/link or useRouter directly
// (tests/i18n/locale-links.test.ts): on /hi pages a link to /playground goes
// to /hi/playground, and pages that aren't translated keep their English
// URL (packages/i18n/paths.ts). In the signed-in app the language is the
// person's (lib/i18n/app-locale.ts), so its links to public pages follow it.

export { useLocalizeHref } from "@/lib/i18n/use-localize-href";

type LinkProps = ComponentProps<typeof Link>;

/** The props a plain <a> takes: next/link's own ones left out. */
function anchorProps({
  as: _as,
  replace: _replace,
  scroll: _scroll,
  shallow: _shallow,
  passHref: _passHref,
  prefetch: _prefetch,
  locale: _locale,
  legacyBehavior: _legacyBehavior,
  onNavigate: _onNavigate,
  transitionTypes: _transitionTypes,
  ...props
}: Omit<LinkProps, "href">) {
  return props;
}

/**
 * next/link that keeps the visitor's language: on /es pages, a link to
 * /pricing goes to /es/pricing. Pages that aren't translated keep their
 * English URL (packages/i18n/paths.ts).
 *
 * Docs pages get a plain <a>: another app serves them behind the same URLs
 * (the docs site, @repo/i18n/docs), or qrdx.dev does when this deployment
 * has none (a redirect), and a link from one app into the other must load
 * the page in full. The site's pages (the blog, @repo/next-config/site-zone)
 * too: the marketing site serves them behind the same URLs once SITE_ORIGIN
 * is set, and this app does until then, so a full page load is right in
 * both modes and next/link never tries to load the other app's page here.
 */
export function LocaleLink({ href, ...props }: LinkProps) {
  const localize = useLocalizeHref();
  const target = typeof href === "string" ? localize(href) : href;
  if (
    typeof target === "string" &&
    (isDocsPagePath(target) || isSitePagePath(target))
  ) {
    return <a href={target} {...anchorProps(props)} />;
  }
  return <Link href={target} {...props} />;
}

type Router = ReturnType<typeof useRouter>;

/** useRouter whose push, replace and prefetch keep the visitor's language. */
export function useLocaleRouter(): Router {
  const router = useRouter();
  const localize = useLocalizeHref();
  return useMemo(
    (): Router => ({
      ...router,
      push: (href, options) => router.push(localize(href), options),
      replace: (href, options) => router.replace(localize(href), options),
      prefetch: (href, options) => router.prefetch(localize(href), options),
    }),
    [router, localize],
  );
}
