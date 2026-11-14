import type { ComponentProps } from "react";
import { openExternal, siteUrl } from "../native/platform";

// next/link for the scanner's few links to qrdx.dev pages (report a code,
// restyle in the playground): they open in the in-app browser.

/**
 * next/link's own props, as next/link declares them, so the web components
 * (and LocaleLink, which strips them for its plain <a>) typecheck here too.
 * Apart from `href`, none of them means anything in the app, so they stop
 * here instead of reaching the <a>. `href` and `as` stay strings: siteUrl
 * takes a path, not a URL object.
 */
interface LinkProps {
  as?: string;
  href: string;
  legacyBehavior?: boolean;
  locale?: string | false;
  onNavigate?: (event: { preventDefault: () => void }) => void;
  passHref?: boolean;
  prefetch?: boolean | "auto" | null;
  replace?: boolean;
  scroll?: boolean;
  shallow?: boolean;
  transitionTypes?: string[];
}

export default function Link({
  href,
  children,
  as: _as,
  legacyBehavior: _legacyBehavior,
  locale: _locale,
  onNavigate: _onNavigate,
  passHref: _passHref,
  prefetch: _prefetch,
  replace: _replace,
  scroll: _scroll,
  shallow: _shallow,
  transitionTypes: _transitionTypes,
  ...props
}: Omit<ComponentProps<"a">, keyof LinkProps> & LinkProps) {
  const url = siteUrl(href);
  return (
    <a
      {...props}
      href={url}
      onClick={(event) => {
        event.preventDefault();
        openExternal(url);
      }}
    >
      {children}
    </a>
  );
}
