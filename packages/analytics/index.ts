/**
 * QRdx's one analytics layer: a typed event catalogue (events.ts) and
 * `track()`, which fans out to Umami (cookieless) and PostHog (with
 * consent). Server events: the app's apps/app/lib/analytics/server.ts.
 * Mounting: analytics.tsx, rendered by the consent manager
 * (consent/consent-manager.tsx).
 */
export type {
  AnalyticsEventName,
  AnalyticsEvents,
  QrSource,
  SignInMethod,
} from "./events";
export { resetAnalytics, track, trackPageview } from "./track";
