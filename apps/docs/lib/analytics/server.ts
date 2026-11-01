import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { after } from "next/server";
import { env } from "@/lib/env";
import { ANALYTICS_CONSENT_COOKIE } from "./config";
import type {
  AnalyticsEvents,
  CleanProps,
  ServerAnalyticsEventName,
} from "./events";
import { sanitizeProps } from "./privacy";

/**
 * Server-side conversions, sent to PostHog's capture API with fetch (no
 * posthog-node needed). An event names the user (distinct id = user id) only
 * when they allowed analytics; otherwise it is an anonymous count with no
 * person, no identifier and no GeoIP. Production deployments only.
 */
const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

export type ServerEventOptions = {
  /** The user's id, used only with their analytics consent. */
  distinctId?: string | null;
  /** Same key, same event: PostHog keeps one copy of redelivered webhooks. */
  dedupeKey?: string;
  timestamp?: Date;
};

/** The request's analytics choice (mirrored by the browser in a cookie). */
export async function hasAnalyticsConsent(): Promise<boolean> {
  try {
    return (await cookies()).get(ANALYTICS_CONSENT_COOKIE)?.value === "1";
  } catch {
    return false;
  }
}

/** A stable UUID (v4 layout) from a key. */
function uuidFromKey(key: string): string {
  const hex = createHash("sha256").update(key).digest("hex").slice(0, 32);
  const variant = ((Number.parseInt(hex[16] ?? "0", 16) & 0x3) | 0x8).toString(
    16,
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function buildServerEvent(
  event: ServerAnalyticsEventName,
  props: CleanProps,
  apiKey: string,
  options: ServerEventOptions = {},
) {
  const uuid = options.dedupeKey
    ? uuidFromKey(`${event}:${options.dedupeKey}`)
    : randomUUID();
  const identified = Boolean(options.distinctId);
  return {
    api_key: apiKey,
    event,
    uuid,
    distinct_id: identified ? (options.distinctId as string) : uuid,
    timestamp: (options.timestamp ?? new Date()).toISOString(),
    properties: {
      ...props,
      $lib: "qrdx-server",
      $process_person_profile: identified,
      $geoip_disable: true,
    },
  };
}

function isServerAnalyticsEnabled(): boolean {
  if (process.env.NODE_ENV !== "production") return false;
  // Vercel previews share production's env; keep them out of the numbers.
  const vercelEnv = process.env.VERCEL_ENV;
  return !vercelEnv || vercelEnv === "production";
}

async function send(body: ReturnType<typeof buildServerEvent>) {
  const host = (env.NEXT_PUBLIC_POSTHOG_HOST ?? DEFAULT_POSTHOG_HOST).replace(
    /\/$/,
    "",
  );
  try {
    const response = await fetch(`${host}/i/v0/e/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      console.error("PostHog capture failed:", body.event, response.status);
    }
  } catch (error) {
    console.error("PostHog capture failed:", body.event, error);
  }
}

/**
 * Records a server-side event after the response is sent. Never throws and
 * never delays the request.
 */
export function trackServer<E extends ServerAnalyticsEventName>(
  event: E,
  props: AnalyticsEvents[E],
  options?: ServerEventOptions,
): void {
  const apiKey = env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!(apiKey && isServerAnalyticsEnabled())) return;
  const body = buildServerEvent(event, sanitizeProps(props), apiKey, options);
  try {
    after(() => send(body));
  } catch {
    // Outside a request scope.
    void send(body);
  }
}
