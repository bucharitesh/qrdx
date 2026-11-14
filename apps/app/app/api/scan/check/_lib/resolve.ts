import type { LinkHop } from "@/components/scanner/link-check";
import {
  HopError,
  type HopErrorCode,
  type HopResponse,
  fetchHop as httpFetchHop,
} from "./hop";
import { type FetchBlockReason, fetchBlockReason } from "./ssrf";

/** At most this many URLs are visited (the scanned one included). */
export const MAX_HOPS = 5;
export const HOP_TIMEOUT_MS = 3000;
/** Whole-chain budget, so a slow chain can't hold the request open. */
export const CHAIN_BUDGET_MS = 9000;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export interface InternalHop {
  /** The next URL in the chain; null when the chain ends on this URL. */
  next: string | null;
  /** The destination must not be revealed (password-protected QRdx code). */
  hidden?: boolean;
}

export type ChainStop =
  | FetchBlockReason
  | HopErrorCode
  | "too-many-redirects"
  | "loop"
  | "bad-location";

export interface ChainResult {
  hops: LinkHop[];
  /** Last URL reached (null when hidden). */
  finalUrl: string | null;
  /** True when the chain reached a URL that doesn't redirect further. */
  complete: boolean;
  /** Why resolution stopped early; null when complete. */
  stop: ChainStop | null;
  /** HTTP status of the final URL, when it was requested. */
  finalStatus: number | null;
  hidden: boolean;
}

export interface ChainDeps {
  fetchHop?: (url: URL, timeoutMs: number) => Promise<HopResponse>;
  /** QRdx short links are resolved from the database, never over HTTP. */
  resolveInternal?: (url: URL) => Promise<InternalHop | null>;
  now?: () => number;
}

export async function resolveChain(
  start: URL,
  {
    fetchHop = httpFetchHop,
    resolveInternal = async () => null,
    now = Date.now,
  }: ChainDeps = {},
): Promise<ChainResult> {
  const hops: LinkHop[] = [];
  const seen = new Set<string>();
  const deadline = now() + CHAIN_BUDGET_MS;
  let current = start;

  const end = (
    finalUrl: string | null,
    stop: ChainStop | null,
    extra: Partial<ChainResult> = {},
  ): ChainResult => ({
    hops,
    finalUrl,
    complete: stop === null,
    stop,
    finalStatus: null,
    hidden: false,
    ...extra,
  });

  while (true) {
    const href = current.toString();
    if (seen.has(href)) return end(href, "loop");
    seen.add(href);

    let next: string;
    const internal = await resolveInternal(current);
    if (internal) {
      hops.push({ url: href, status: null });
      if (internal.hidden) return end(null, null, { hidden: true });
      if (!internal.next) return end(href, null);
      next = internal.next;
    } else {
      const blocked = fetchBlockReason(current);
      if (blocked) {
        hops.push({ url: href, status: null });
        // App links (market:, intent:, mailto: ...) are a destination, not an error.
        return end(href, blocked === "unsupported-scheme" ? null : blocked);
      }
      const remaining = deadline - now();
      if (remaining < 250) {
        hops.push({ url: href, status: null });
        return end(href, "timeout");
      }
      let response: HopResponse;
      try {
        response = await fetchHop(current, Math.min(HOP_TIMEOUT_MS, remaining));
      } catch (error) {
        hops.push({ url: href, status: null });
        return end(href, error instanceof HopError ? error.code : "network");
      }
      hops.push({ url: href, status: response.status });
      if (!REDIRECT_STATUSES.has(response.status) || !response.location) {
        return end(href, null, { finalStatus: response.status });
      }
      next = response.location;
    }

    if (hops.length >= MAX_HOPS) return end(href, "too-many-redirects");
    try {
      current = new URL(next, current);
    } catch {
      return end(href, "bad-location");
    }
  }
}
