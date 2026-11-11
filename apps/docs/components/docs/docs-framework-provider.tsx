"use client";

import { type Framework, FrameworkProvider } from "fumadocs-core/framework";
import Image from "next/image";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { DEFAULT_LOCALE, LOCALE_INFO } from "@/lib/i18n/config";

const ENGLISH_PREFIX = new RegExp(
  `^/${LOCALE_INFO[DEFAULT_LOCALE].segment}(?=/docs(?:/|$))`,
);

/**
 * The pathname the reader sees. English docs are prerendered at
 * /en/docs/... (next.config.ts rewrites /docs/... there), so on the server
 * Next reports that path while the browser shows /docs/...; fumadocs marks
 * the current sidebar item and tab from it, and the two must agree.
 */
function useDocsPathname(): string {
  return usePathname().replace(ENGLISH_PREFIX, "");
}

/** fumadocs' Next integration (fumadocs-core/framework/next), with that pathname. */
export function DocsFrameworkProvider({ children }: { children: ReactNode }) {
  return (
    <FrameworkProvider
      // As fumadocs-core/framework/next passes them.
      Image={Image as Framework["Image"]}
      Link={Link as Framework["Link"]}
      useParams={useParams}
      usePathname={useDocsPathname}
      useRouter={useRouter}
    >
      {children}
    </FrameworkProvider>
  );
}
