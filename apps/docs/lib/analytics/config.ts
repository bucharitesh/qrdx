/**
 * Where analytics may run. Production builds on the app's own host only
 * (NEXT_PUBLIC_APP_URL, qrdx.dev in production), so Vercel previews, custom
 * domains and self-hosted forks without their own keys stay out of the
 * numbers. Local development sends nothing unless this browser opts in with
 * `localStorage.setItem("qrdx:analytics-debug", "1")`, which also logs each
 * event to the console.
 */
export const ANALYTICS_DEBUG_KEY = "qrdx:analytics-debug";

/**
 * Mirrors the visitor's analytics choice ("1" when allowed) so server-side
 * events know whether they may name the user. Set and cleared with the
 * consent choice; holds nothing else.
 */
export const ANALYTICS_CONSENT_COOKIE = "qrdx_analytics";

export function analyticsHostname(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://qrdx.dev")
      .hostname;
  } catch {
    return "qrdx.dev";
  }
}

export function isAnalyticsDebug(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  try {
    return window.localStorage.getItem(ANALYTICS_DEBUG_KEY) === "1";
  } catch {
    return false;
  }
}

/** Analytics can run in this browser tab at all (before consent rules). */
export function isAnalyticsRuntime(): boolean {
  if (typeof window === "undefined") return false;
  if (process.env.NODE_ENV !== "production" && !isAnalyticsDebug()) {
    return false;
  }
  return window.location.hostname === analyticsHostname();
}

export function debugLog(destination: string, ...args: unknown[]) {
  if (isAnalyticsDebug()) console.debug(`[analytics:${destination}]`, ...args);
}
