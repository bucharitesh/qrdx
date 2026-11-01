import { debugLog, isAnalyticsRuntime } from "./config";
import type { AnalyticsEventName, AnalyticsPropsArg } from "./events";
import {
  capturePostHog,
  capturePostHogPageview,
  resetPostHog,
} from "./posthog";
import { isUntrackedAnalyticsPath, sanitizeProps } from "./privacy";
import { sendUmamiEvent, sendUmamiPageview } from "./umami";

function canTrackHere(): boolean {
  return (
    isAnalyticsRuntime() && !isUntrackedAnalyticsPath(window.location.pathname)
  );
}

/**
 * Records a product event. Properties are sanitized (see privacy.ts), then
 * sent to Umami (cookieless; skipped under Do Not Track / GPC) and to
 * PostHog (only with the visitor's analytics consent). Never throws.
 *
 * @example track("qr_downloaded", { format: "png", source: "playground" })
 */
export function track<E extends AnalyticsEventName>(
  event: E,
  ...[props]: AnalyticsPropsArg<E>
): void {
  try {
    if (!canTrackHere()) return;
    const clean = sanitizeProps(props);
    debugLog("track", event, clean);
    sendUmamiEvent(event, clean);
    capturePostHog(event, clean);
  } catch (error) {
    console.error("Analytics event failed:", event, error);
  }
}

/** One pageview, sent on every App Router navigation. */
export function trackPageview(): void {
  try {
    if (!canTrackHere()) return;
    sendUmamiPageview();
    capturePostHogPageview();
  } catch (error) {
    console.error("Analytics pageview failed:", error);
  }
}

/** Forget the signed-in user (call after signing out). */
export function resetAnalytics(): void {
  try {
    resetPostHog();
  } catch (error) {
    console.error("Analytics reset failed:", error);
  }
}
