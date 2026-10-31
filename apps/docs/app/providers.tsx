"use client";

import { DesignSystemProvider } from "@repo/design-system";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { type ReactNode, Suspense } from "react";
import { AuthDialogWrapper } from "@/components/auth-dialog-wrapper";
import { GetProDialogWrapper } from "@/components/get-pro-dialog-wrapper";
import { NotOnCustomerPages } from "@/components/landing/not-on-customer-pages";
import { ChatProvider } from "@/lib/hooks/use-chat-context";
import { QueryProvider } from "@/lib/query-client";

export function Provider({ children }: { children: ReactNode }) {
  return (
    <DesignSystemProvider>
      <NuqsAdapter>
        <QueryProvider>
          <ChatProvider>
            {/* AuthDialog reads useSearchParams(); keep its CSR bailout away from page content */}
            <NotOnCustomerPages>
              <Suspense fallback={null}>
                <AuthDialogWrapper />
                <GetProDialogWrapper />
              </Suspense>
            </NotOnCustomerPages>
            {children}
          </ChatProvider>
        </QueryProvider>
      </NuqsAdapter>
    </DesignSystemProvider>
  );
}
