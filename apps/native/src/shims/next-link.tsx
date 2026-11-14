import type { AnchorHTMLAttributes, ReactNode } from "react";
import { openExternal, siteUrl } from "../native/platform";

// next/link for the scanner's few links to qrdx.dev pages (report a code,
// restyle in the playground): they open in the in-app browser.
export default function Link({
  href,
  children,
  prefetch: _prefetch,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  children?: ReactNode;
  /** next/link's own prop; nothing to prefetch in the app. */
  prefetch?: boolean;
}) {
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
