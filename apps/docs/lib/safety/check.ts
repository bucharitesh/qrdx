import "server-only";

import { baseUrl } from "@/lib/metadata";
import { SHORT_LINK_BASE } from "@/lib/short-links";
import {
  analyzeUrl,
  URL_SIGNAL_LABELS,
  type UrlSignal,
} from "./url-heuristics";
import {
  lookupWebRisk,
  type WebRiskResult,
  type WebRiskThreat,
} from "./web-risk";

/**
 * - "block": never acceptable (Web Risk threat, dangerous scheme, invalid).
 * - "review": suspicious but often legitimate (heuristic warnings).
 * - "ok": nothing found (Web Risk may have been skipped, see `webRisk`).
 */
export type SafetyVerdict = "block" | "review" | "ok";

export interface UrlSafety {
  verdict: SafetyVerdict;
  signals: UrlSignal[];
  threats: WebRiskThreat[];
  webRisk: WebRiskResult["status"];
  displayHostname: string | null;
}

export const THREAT_LABELS: Record<WebRiskThreat, string> = {
  MALWARE: "malware",
  SOCIAL_ENGINEERING: "phishing or a scam",
  UNWANTED_SOFTWARE: "unwanted software",
};

/** Our own hosted landing pages (`<app or short-link origin>/p/<slug>`). */
function isOwnHostedPage(value: string): boolean {
  try {
    const url = new URL(value);
    const origins = new Set([baseUrl.origin, new URL(SHORT_LINK_BASE).origin]);
    return origins.has(url.origin) && /^\/p\/[^/]+$/.test(url.pathname);
  } catch {
    return false;
  }
}

/** Heuristics plus a Google Web Risk lookup (fail-open, cached). */
export async function checkUrlSafety(url: string): Promise<UrlSafety> {
  if (isOwnHostedPage(url)) {
    return {
      verdict: "ok",
      signals: [],
      threats: [],
      webRisk: "unknown",
      displayHostname: new URL(url).hostname,
    };
  }
  const analysis = analyzeUrl(url);
  const base = {
    signals: analysis.signals,
    displayHostname: analysis.displayHostname,
  };
  if (analysis.severity === "block" || !analysis.url) {
    return { ...base, verdict: "block", threats: [], webRisk: "unknown" };
  }

  const webRisk = await lookupWebRisk(analysis.url.href);
  if (webRisk.status === "threat") {
    return {
      ...base,
      verdict: "block",
      threats: webRisk.threats,
      webRisk: webRisk.status,
    };
  }
  return {
    ...base,
    verdict: analysis.severity === "warn" ? "review" : "ok",
    threats: [],
    webRisk: webRisk.status,
  };
}

/** Human-readable reasons, e.g. for an abuse report or an error message. */
export function describeSafety(safety: UrlSafety): string[] {
  return [
    ...safety.threats.map(
      (threat) => `Google Web Risk: ${THREAT_LABELS[threat]}`,
    ),
    ...safety.signals.map((signal) => URL_SIGNAL_LABELS[signal]),
  ];
}

/** Runs `fn` over `items` with at most `limit` calls in flight. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index] as T);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}
