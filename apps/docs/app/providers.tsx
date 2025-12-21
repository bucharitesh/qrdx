"use client";

import { DesignSystemProvider } from "@repo/design-system";
import { RootProvider } from "fumadocs-ui/provider/base";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { type ReactNode, Suspense } from "react";
import { AuthDialogWrapper } from "@/components/auth-dialog-wrapper";
import { GetProDialogWrapper } from "@/components/get-pro-dialog-wrapper";
import { ChatProvider } from "@/lib/hooks/use-chat-context";
import { QueryProvider } from "@/lib/query-client";

export function Provider({ children }: { children: ReactNode }) {
  return (
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
  );
}
