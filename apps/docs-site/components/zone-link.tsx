import { isDocsPagePath } from "@repo/next-config/docs-zone";
import Link from "next/link";
import type { ComponentProps } from "react";
import { translatedDocsSegments } from "@/lib/i18n/docs";

// The docs site is one zone of qrdx.dev (@repo/next-config/docs-zone): it
// serves the docs pages, and the main app serves everything else. next/link
// can only load pages of the app it runs in, so links to the docs use it
// and every other internal link is a plain <a>, a full page load into the
// main app.

const DOCS_SEGMENTS = translatedDocsSegments();

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

/** Whether `href` is a page of this app (a docs page). */
export function isDocsPage(href: string): boolean {
  return isDocsPagePath(href, DOCS_SEGMENTS);
}

/** next/link for docs pages, a plain <a> for the rest of the site. */
export function ZoneLink({ href, ...props }: LinkProps) {
  if (typeof href === "string" && !isDocsPage(href)) {
    return <a href={href} {...anchorProps(props)} />;
  }
  return <Link href={href} {...props} />;
}
