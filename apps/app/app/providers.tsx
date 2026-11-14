"use client";

// First: before any schema parses in the browser (see the file).
import "@/lib/zod-csp";
import { DesignSystemProvider } from "@repo/design-system";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { type ReactNode, Suspense } from "react";
import { AuthDialogWrapper } from "@/components/auth-dialog-wrapper";
import { AvailabilityProvider } from "@/components/availability-provider";
import { ConsentManager } from "@/components/consent/consent-manager";
import { useCspNonce } from "@/components/csp-nonce";
import { GetProDialogWrapper } from "@/components/get-pro-dialog-wrapper";
import { NotOnCustomerPages } from "@/components/landing/not-on-customer-pages";
import { LandingCapture } from "@/components/landing-capture";
import { NavigationHistory } from "@/components/navigation-history";
import { ReferralCapture } from "@/components/referral-capture";
import { SoundProvider } from "@/components/sound/sound-provider";
import type { PublicAvailability } from "@/lib/feature-availability-rules";
import { ChatProvider } from "@/lib/hooks/use-chat-context";
import { QueryProvider } from "@/lib/query-client";

/**
 * Toasts sit bottom right. The app's "Get set up" launcher
 * (components/app-shell/setup-guide.tsx) sets --setup-guide-toast-clearance
 * on <body> while it's on screen, so they stack above it (and above its
 * panel while that's open); elsewhere it's unset and sonner's own offsets
 * (24px, 16px on phones) apply.
 */
const TOASTER = {
  offset: { bottom: "max(24px, var(--setup-guide-toast-clearance, 0px))" },
  mobileOffset: {
    bottom: "max(16px, var(--setup-guide-toast-clearance, 0px))",
  },
};

export function Provider({
  availability,
  children,
}: {
  availability: PublicAvailability;
  children: ReactNode;
}) {
  // next-themes' inline theme script needs the CSP nonce on nonce routes.
  const nonce = useCspNonce();
  return (
    <AvailabilityProvider value={availability}>
      <DesignSystemProvider nonce={nonce} toaster={TOASTER}>
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
              {/* Pathnames of this tab's pages, in memory only: where a link into the playground came from. */}
              <NavigationHistory />
              {/* An affiliate link's code, in this tab's memory only, for a sign-up in the same visit. */}
              <NotOnCustomerPages>
                <ReferralCapture />
              </NotOnCustomerPages>
              {/* How this tab's visit started (referring host, campaign tags, first page), in memory only, for a sign-up in the same visit. */}
              <NotOnCustomerPages>
                <LandingCapture />
              </NotOnCustomerPages>
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
    </AvailabilityProvider>
  );
}
