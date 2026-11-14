"use client";

import { HeadManagerContext } from "next/dist/shared/lib/head-manager-context.shared-runtime";
import { useContext } from "react";

/**
 * The request's CSP nonce while server-rendering a nonce route (see
 * @repo/next-config/csp), else undefined. Next reads it from the policy that
 * proxy.ts sets and hands it to next/script through this context; inline
 * scripts we render ourselves need it too. Prerendered pages have none (their
 * policy allows inline scripts).
 */
export function useCspNonce(): string | undefined {
  return useContext(HeadManagerContext)?.nonce || undefined;
}

/**
 * An inline script that also runs under the nonce policy. Browsers hide the
 * nonce attribute after parsing, hence the hydration warning suppression.
 */
export function InlineScript({ html, id }: { html: string; id?: string }) {
  const nonce = useCspNonce();
  return (
    <script
      // biome-ignore lint/security/noDangerouslySetInnerHtml: callers pass static scripts only
      dangerouslySetInnerHTML={{ __html: html }}
      id={id}
      nonce={nonce}
      suppressHydrationWarning
    />
  );
}
