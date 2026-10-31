"use client";

import { cn } from "@repo/design-system/lib/utils";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * .ics download for an event block. The file is served per code slug
 * (/api/calendar/<slug>), read from the page's own /p/<slug> path, so it also
 * works on custom domains; the editor preview has no slug yet.
 */
export function EventIcsLink({
  blockId,
  live,
  className,
  children,
}: {
  blockId: string;
  live: boolean;
  className?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const slug = /^\/p\/([^/]+)\/?$/.exec(pathname ?? "")?.[1];

  if (!live || !slug) {
    return (
      <span
        aria-disabled="true"
        className={cn(className, "cursor-not-allowed opacity-50")}
        title="Available on the published page"
      >
        {children}
      </span>
    );
  }
  return (
    <a
      className={className}
      data-lp-block={blockId}
      data-lp-target="ics"
      download
      href={`/api/calendar/${slug}?block=${encodeURIComponent(blockId)}`}
    >
      {children}
    </a>
  );
}
