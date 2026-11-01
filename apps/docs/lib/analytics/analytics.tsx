"use client";

import { authClient } from "@repo/auth/client";
import { usePathname } from "next/navigation";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { getAnalyticsPlan } from "@/actions/analytics";
import { analyticsHostname } from "./config";
import { syncAnalyticsSession } from "./identity";
import { setPostHogConsent, setPostHogPersonProperties } from "./posthog";
import { trackPageview } from "./track";
import { flushUmami, getUmamiConfig, isUmamiEnabled } from "./umami";

/**
 * QRdx's analytics, mounted by the consent manager (so never on customer
 * pages or the scanner). `measurement` is the visitor's Analytics choice, or
 * null while it is still unknown: PostHog waits for it, Umami doesn't need it.
 */
export function Analytics({ measurement }: { measurement: boolean | null }) {
  useEffect(() => {
    if (measurement !== null) setPostHogConsent(measurement);
  }, [measurement]);

  return (
    <>
      <UmamiScript />
      <PageviewTracker />
      <AnalyticsIdentity measurement={measurement === true} />
    </>
  );
}

function UmamiScript() {
  // Client only (the consent manager never server-renders).
  const [config] = useState(() => (isUmamiEnabled() ? getUmamiConfig() : null));
  if (!config) return null;
  return (
    <Script
      id="umami"
      src={config.scriptUrl}
      strategy="lazyOnload"
      data-website-id={config.websiteId}
      data-domains={analyticsHostname()}
      data-auto-track="false"
      data-do-not-track="true"
      data-exclude-search="true"
      data-exclude-hash="true"
      onReady={flushUmami}
    />
  );
}

/** App Router navigations don't reload the page: one pageview per path. */
function PageviewTracker() {
  const pathname = usePathname();
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (last.current === pathname) return;
    last.current = pathname;
    trackPageview();
  }, [pathname]);
  return null;
}

function AnalyticsIdentity({ measurement }: { measurement: boolean }) {
  const { data, isPending } = authClient.useSession();
  const userId = data?.user.id ?? null;
  const userCreatedAt = data ? new Date(data.user.createdAt).getTime() : 0;
  const sessionCreatedAt = data
    ? new Date(data.session.createdAt).getTime()
    : 0;
  const organizationId =
    (data?.session as { activeOrganizationId?: string | null } | undefined)
      ?.activeOrganizationId ?? null;

  useEffect(() => {
    if (isPending) return;
    syncAnalyticsSession(
      userId
        ? { userId, userCreatedAt, sessionCreatedAt, organizationId }
        : null,
      () => authClient.getLastUsedLoginMethod(),
    );
  }, [isPending, userId, userCreatedAt, sessionCreatedAt, organizationId]);

  // The plan is a PostHog person property, so it is only fetched with consent.
  useEffect(() => {
    if (!(measurement && userId)) return;
    let cancelled = false;
    getAnalyticsPlan()
      .then((plan) => {
        if (!cancelled && plan) setPostHogPersonProperties({ plan });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [measurement, userId]);

  return null;
}
