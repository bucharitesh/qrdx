/**
 * QRdx's one analytics layer: a typed event catalogue (events.ts) and
 * `track()`, which fans out to Umami (cookieless) and PostHog (with
 * consent). Server events: lib/analytics/server.ts. Mounting:
 * lib/analytics/analytics.tsx, rendered by the consent manager.
 */
export type {
  AnalyticsEventName,
  AnalyticsEvents,
  QrSource,
  SignInMethod,
} from "./events";
export { resetAnalytics, track, trackPageview } from "./track";
