import type { CaptureResult, PostHog, Properties } from "posthog-js";
import { env } from "@/lib/env";
import { ANALYTICS_CONSENT_COOKIE, debugLog } from "./config";
import {
  isUntrackedAnalyticsPath,
  safeTitle,
  sanitizePath,
  sanitizeUrl,
} from "./privacy";

/**
 * PostHog, gated on the visitor's "Analytics" (measurement) consent.
 *
 * - Until the consent manager reports a choice, nothing loads and calls wait
 *   in memory; nothing is sent.
 * - Granted: posthog-js loads (a lazy chunk, kept out of first loads),
 *   starts through the same-origin /ingest proxy and sends what waited.
 *   Denied: the waiting calls are dropped.
 * - Revoked later: capturing stops at once (opt_out_capturing), and the
 *   consent manager clears PostHog's ph_* cookies and storage.
 */
type ConsentState = "unknown" | "granted" | "denied";
type Call = (posthog: PostHog) => void;

/** Under ph_* so the consent manager clears PostHog's own opt-in record too. */
const CONSENT_PERSISTENCE_NAME = "ph_qrdx_consent";
const MAX_WAITING = 100;

let consent: ConsentState = "unknown";
/** The started instance, kept across a revoke and re-grant. */
let instance: PostHog | null = null;
let loading = false;
/** No key, or the chunk failed to load: drop calls instead of queueing. */
let unavailable = false;
let waiting: Call[] = [];
let sessionKnown = false;
let user: { id: string; properties: Properties } | null = null;
let group: string | null = null;
/** Path of the last pageview, and whether PostHog got (or will get) it. */
let lastPageviewPath: string | null = null;
let lastPageviewSent = false;

function setConsentCookie(granted: boolean) {
  try {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    // biome-ignore lint/suspicious/noDocumentCookie: the Cookie Store API isn't in Safari or Firefox.
    document.cookie = granted
      ? `${ANALYTICS_CONSENT_COOKIE}=1; Path=/; Max-Age=31536000; SameSite=Lax${secure}`
      : `${ANALYTICS_CONSENT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
  } catch {}
}

function sanitizeProperties(properties: Properties | undefined) {
  if (!properties) return;
  for (const key of Object.keys(properties)) {
    const value = properties[key];
    if (typeof value !== "string") continue;
    if (/(_url|referrer)$/.test(key)) properties[key] = sanitizeUrl(value);
    else if (/pathname$/.test(key)) properties[key] = sanitizePath(value);
  }
  if (typeof properties.title === "string") {
    properties.title = safeTitle(window.location.pathname, properties.title);
  }
}

/**
 * Last stop before anything leaves for PostHog: drops events from untracked
 * pages (admin, customer pages, scanner) and strips query strings, hashes
 * and secret path segments from every URL PostHog adds on its own.
 */
export function beforeSend(event: CaptureResult | null): CaptureResult | null {
  if (!event) return null;
  if (isUntrackedAnalyticsPath(window.location.pathname)) return null;
  sanitizeProperties(event.properties);
  sanitizeProperties(event.$set);
  sanitizeProperties(event.$set_once);
  return event;
}

/**
 * The person properties last sent in this tab (under ph_* so revoking
 * consent clears it): identify and $set go out once, not on every page load.
 */
const PERSON_KEY = "ph_qrdx_person";

function readSentPerson(id: string): Properties {
  try {
    const [sentId, sent] = JSON.parse(
      window.sessionStorage.getItem(PERSON_KEY) ?? "[]",
    ) as [string?, Properties?];
    return sentId === id && sent ? sent : {};
  } catch {
    return {};
  }
}

function syncPerson(posthog: PostHog) {
  if (!user) return;
  const already = readSentPerson(user.id);
  const sent = Object.entries(user.properties).every(
    ([key, value]) => already[key] === value,
  );
  try {
    window.sessionStorage.setItem(
      PERSON_KEY,
      JSON.stringify([user.id, { ...already, ...user.properties }]),
    );
  } catch {}
  if (posthog.get_distinct_id() !== user.id) {
    posthog.identify(user.id, user.properties);
  } else if (!sent) {
    posthog.setPersonProperties(user.properties);
  }
}

function applyUser(posthog: PostHog) {
  if (user) {
    syncPerson(posthog);
    if (group) posthog.group("organization", group);
    else posthog.resetGroups();
  } else if (
    sessionKnown &&
    posthog.get_property("$user_state") === "identified"
  ) {
    // Signed out since PostHog last ran in this browser.
    posthog.reset();
  }
}

async function init(): Promise<PostHog | null> {
  const key = env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) {
    debugLog("posthog", "NEXT_PUBLIC_POSTHOG_KEY is unset; PostHog is off");
    return null;
  }
  const { default: posthog } = await import("posthog-js");
  posthog.init(key, {
    api_host: "/ingest",
    ui_host: "https://us.posthog.com",
    person_profiles: "identified_only",
    // Pageviews are sent on App Router navigations (trackPageview).
    capture_pageview: false,
    capture_pageleave: true,
    // Explicit events only: autocapture would send element text and link
    // targets, which can hold names and destination URLs.
    autocapture: false,
    capture_dead_clicks: false,
    capture_exceptions: false,
    enable_heatmaps: false,
    // Replay is off: settings, dashboards and OAuth screens show personal data.
    disable_session_recording: true,
    disable_surveys: true,
    advanced_disable_flags: true,
    disable_external_dependency_loading: true,
    consent_persistence_name: CONSENT_PERSISTENCE_NAME,
    before_send: beforeSend,
  });
  return posthog;
}

/** Opts in (again) and sends whatever waited. */
function activate(posthog: PostHog) {
  if (posthog.has_opted_out_capturing()) {
    posthog.opt_in_capturing({ captureEventName: false });
  }
  applyUser(posthog);
  const calls = waiting;
  waiting = [];
  for (const call of calls) call(posthog);
}

function start() {
  if (instance) {
    activate(instance);
    return;
  }
  if (loading || unavailable) return;
  loading = true;
  init()
    .then((posthog) => {
      if (!posthog) {
        unavailable = true;
        waiting = [];
        return;
      }
      instance = posthog;
      if (consent === "granted") activate(posthog);
      else posthog.opt_out_capturing();
    })
    .catch((error) => {
      console.error("PostHog failed to load:", error);
      unavailable = true;
      waiting = [];
    })
    .finally(() => {
      loading = false;
    });
}

/** Runs `call` on PostHog once consent allows it; drops it otherwise. */
function withPostHog(call: Call) {
  if (consent === "denied" || unavailable) return;
  if (consent === "granted" && instance) {
    call(instance);
    return;
  }
  if (waiting.length < MAX_WAITING) waiting.push(call);
}

/** Called by the consent bridge with the visitor's measurement choice. */
export function setPostHogConsent(granted: boolean) {
  const next: ConsentState = granted ? "granted" : "denied";
  if (next === consent) return;
  consent = next;
  setConsentCookie(granted);

  if (!granted) {
    waiting = [];
    lastPageviewSent = false;
    instance?.opt_out_capturing();
    return;
  }
  // Accepted on a page that was already counted without PostHog.
  if (lastPageviewPath === window.location.pathname && !lastPageviewSent) {
    lastPageviewSent = true;
    withPostHog((posthog) => posthog.capture("$pageview"));
  }
  start();
}

export function hasPostHogConsent(): boolean {
  return consent === "granted";
}

export function capturePostHog(event: string, properties: Properties) {
  withPostHog((posthog) => posthog.capture(event, properties));
}

export function capturePostHogPageview() {
  lastPageviewPath = window.location.pathname;
  lastPageviewSent = consent !== "denied" && !unavailable;
  withPostHog((posthog) => posthog.capture("$pageview"));
}

/** The signed-in user (null when signed out), applied whenever PostHog runs. */
export function setPostHogUser(
  next: { id: string; properties: Properties } | null,
  organizationId: string | null,
) {
  const changed =
    !sessionKnown || next?.id !== user?.id || organizationId !== group;
  sessionKnown = true;
  user = next;
  group = next ? organizationId : null;
  if (changed && instance && consent === "granted") applyUser(instance);
}

export function setPostHogPersonProperties(properties: Properties) {
  if (!user) return;
  user.properties = { ...user.properties, ...properties };
  withPostHog(syncPerson);
}

/** Sign-out: forget the user so later events are anonymous again. */
export function resetPostHog() {
  sessionKnown = true;
  user = null;
  group = null;
  try {
    window.sessionStorage.removeItem(PERSON_KEY);
  } catch {}
  instance?.reset();
}

/** Test hook: forget all state between cases. */
export function __resetPostHogForTests() {
  consent = "unknown";
  instance = null;
  loading = false;
  unavailable = false;
  waiting = [];
  sessionKnown = false;
  user = null;
  group = null;
  lastPageviewPath = null;
  lastPageviewSent = false;
}
