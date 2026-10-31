import "server-only";

import { env } from "@/lib/env";

/**
 * Google Web Risk lookups (uris.search) for destination URLs. Cached per
 * instance and fail-open: when the key is missing or Google can't be reached
 * the result is "unknown" and callers carry on with their own checks.
 * https://cloud.google.com/web-risk/docs/lookup-api
 */

export const WEB_RISK_THREAT_TYPES = [
  "MALWARE",
  "SOCIAL_ENGINEERING",
  "UNWANTED_SOFTWARE",
] as const;

export type WebRiskThreat = (typeof WEB_RISK_THREAT_TYPES)[number];

export type WebRiskResult =
  | { status: "safe" }
  | { status: "threat"; threats: WebRiskThreat[] }
  | { status: "unknown"; reason: "unconfigured" | "unsupported" | "error" };

const ENDPOINT = "https://webrisk.googleapis.com/v1/uris:search";
const TIMEOUT_MS = 2500;
const SAFE_TTL_MS = 30 * 60_000;
const THREAT_TTL_MS = 6 * 60 * 60_000;
// Errors are remembered briefly so an outage doesn't add a timeout to every request.
const ERROR_TTL_MS = 60_000;
// After an outage or quota error, every lookup is skipped for this long.
const OUTAGE_COOLDOWN_MS = 60_000;
const CACHE_MAX_ENTRIES = 5000;
const MAX_URI_LENGTH = 2048;

const cache = new Map<string, { result: WebRiskResult; expiresAt: number }>();
const inflight = new Map<string, Promise<WebRiskResult>>();
let unavailableUntil = 0;

export function isWebRiskConfigured(): boolean {
  return Boolean(env.WEB_RISK_API_KEY);
}

function remember(key: string, result: WebRiskResult, ttlMs: number) {
  const now = Date.now();
  if (cache.size >= CACHE_MAX_ENTRIES) {
    for (const [entryKey, entry] of cache) {
      if (entry.expiresAt <= now) cache.delete(entryKey);
    }
    // Still full: drop the oldest entry (Map keeps insertion order).
    const oldest = cache.keys().next().value;
    if (cache.size >= CACHE_MAX_ENTRIES && oldest) cache.delete(oldest);
  }
  cache.set(key, { result, expiresAt: now + ttlMs });
}

function isThreat(value: unknown): value is WebRiskThreat {
  return WEB_RISK_THREAT_TYPES.includes(value as WebRiskThreat);
}

/** TTL from Google's expireTime, within sane bounds. */
function threatTtl(expireTime: unknown): number {
  const expiresAt =
    typeof expireTime === "string" ? Date.parse(expireTime) : Number.NaN;
  if (!Number.isFinite(expiresAt)) return THREAT_TTL_MS;
  return Math.min(THREAT_TTL_MS, Math.max(60_000, expiresAt - Date.now()));
}

interface SearchOutcome {
  result: WebRiskResult;
  ttlMs: number;
}

const failed: SearchOutcome = {
  result: { status: "unknown", reason: "error" },
  ttlMs: ERROR_TTL_MS,
};

async function search(uri: string, apiKey: string): Promise<SearchOutcome> {
  const query = new URLSearchParams({ uri });
  for (const type of WEB_RISK_THREAT_TYPES) query.append("threatTypes", type);

  let response: Response;
  try {
    response = await fetch(`${ENDPOINT}?${query}`, {
      // The key goes in a header so it never shows up in logged URLs.
      headers: { "X-Goog-Api-Key": apiKey, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    unavailableUntil = Date.now() + OUTAGE_COOLDOWN_MS;
    console.warn("[safety] Web Risk lookup failed:", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return failed;
  }

  if (!response.ok) {
    // Quota, auth and server errors affect every URL, not just this one.
    if (
      response.status === 429 ||
      response.status === 403 ||
      response.status >= 500
    ) {
      unavailableUntil = Date.now() + OUTAGE_COOLDOWN_MS;
    }
    console.warn("[safety] Web Risk lookup failed:", {
      status: response.status,
    });
    return failed;
  }

  let body: { threat?: { threatTypes?: unknown; expireTime?: unknown } };
  try {
    body = await response.json();
  } catch {
    console.warn("[safety] Web Risk returned invalid JSON");
    return failed;
  }

  const threats = Array.isArray(body?.threat?.threatTypes)
    ? body.threat.threatTypes.filter(isThreat)
    : [];
  return threats.length > 0
    ? {
        result: { status: "threat", threats },
        ttlMs: threatTtl(body.threat?.expireTime),
      }
    : { result: { status: "safe" }, ttlMs: SAFE_TTL_MS };
}

/**
 * Looks up an http(s) URL. Never throws: "unknown" means the lookup was
 * skipped (no WEB_RISK_API_KEY, unsupported URL) or failed (logged).
 */
export async function lookupWebRisk(url: string): Promise<WebRiskResult> {
  const apiKey = env.WEB_RISK_API_KEY;
  if (!apiKey) return { status: "unknown", reason: "unconfigured" };

  let key: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { status: "unknown", reason: "unsupported" };
    }
    // Fragments never reach a server, so they don't change the verdict.
    parsed.hash = "";
    key = parsed.href;
  } catch {
    return { status: "unknown", reason: "unsupported" };
  }
  if (key.length > MAX_URI_LENGTH) {
    return { status: "unknown", reason: "unsupported" };
  }

  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.result;
  if (Date.now() < unavailableUntil) {
    return { status: "unknown", reason: "error" };
  }

  let pending = inflight.get(key);
  if (!pending) {
    pending = search(key, apiKey)
      .then(({ result, ttlMs }) => {
        remember(key, result, ttlMs);
        return result;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  return pending;
}

/** Clears the lookup cache (tests). */
export function clearWebRiskCache(): void {
  cache.clear();
  inflight.clear();
  unavailableUntil = 0;
}
