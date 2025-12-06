/** biome-ignore-all lint/security/noDangerouslySetInnerHtml: false positive */
"use client";

import { DesignSystemProvider } from "@repo/design-system";
import { RootProvider } from "fumadocs-ui/provider/base";
import dynamic from "next/dynamic";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { type ReactNode, Suspense } from "react";
import { AuthDialogWrapper } from "@/components/auth-dialog-wrapper";
import { GetProDialogWrapper } from "@/components/get-pro-dialog-wrapper";
import { ChatProvider } from "@/lib/hooks/use-chat-context";
import { QueryProvider } from "@/lib/query-client";

const SearchDialog = dynamic(() => import("@/components/search"), {
  ssr: false,
});

const inject = `
const urlParams = new URLSearchParams(window.location.search);
const uwuParam = urlParams.get("uwu");

if (typeof uwuParam === 'string') {
    localStorage.setItem('uwu', uwuParam);
}

const item = localStorage.getItem('uwu')

if (item === 'true') {
    document.documentElement.classList.add("uwu")
}
`;

export function Provider({ children }: { children: ReactNode }) {
  return (
    <RootProvider
      search={{
        SearchDialog,
      }}
    >
      <script
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: inject }}
      />
      <DesignSystemProvider>
        <NuqsAdapter>
          <QueryProvider>
            <ChatProvider>
              <Suspense>
                <AuthDialogWrapper />
                <GetProDialogWrapper />
                {children}
              </Suspense>
            </ChatProvider>
          </QueryProvider>
        </NuqsAdapter>
      </DesignSystemProvider>
    </RootProvider>
  );
}
