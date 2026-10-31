"use client";

import { DesignSystemProvider } from "@repo/design-system";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { type ReactNode, Suspense } from "react";
import { AuthDialogWrapper } from "@/components/auth-dialog-wrapper";
import { ConsentManager } from "@/components/consent/consent-manager";
import { GetProDialogWrapper } from "@/components/get-pro-dialog-wrapper";
import { NotOnCustomerPages } from "@/components/landing/not-on-customer-pages";
import { SoundProvider } from "@/components/sound/sound-provider";
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
            {/* Cookie banner + consent-gated PostHog/Featurebase. Never on customer pages (/p, /q gates, /ended; only owner-set pixels load there) or the no-tracking scanner (/scan). */}
            <NotOnCustomerPages>
              <ConsentManager />
            </NotOnCustomerPages>
            {/* UI sounds (lib/sound): silent until a gesture, never on customer pages or /scan. */}
            <NotOnCustomerPages>
              <SoundProvider />
            </NotOnCustomerPages>
          </ChatProvider>
        </QueryProvider>
      </NuqsAdapter>
    </DesignSystemProvider>
  );
}
