import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import { createGuardedLookup } from "./ssrf";

export interface HopResponse {
  status: number;
  location: string | null;
}

export type HopErrorCode =
  | "timeout"
  | "blocked-address"
  | "dns"
  | "tls"
  | "network";

export class HopError extends Error {
  readonly code: HopErrorCode;

  constructor(code: HopErrorCode, message: string) {
    super(message);
    this.name = "HopError";
    this.code = code;
  }
}

const USER_AGENT =
  "Mozilla/5.0 (compatible; QRdxLinkCheck/1.0; +https://qrdx.dev/scan)";

function classify(error: unknown): HopError {
  if (error instanceof HopError) return error;
  const code = (error as NodeJS.ErrnoException)?.code ?? "";
  const name = (error as Error)?.name ?? "";
  if (code === "EBLOCKED") {
    return new HopError("blocked-address", "private address");
  }
  if (
    name === "AbortError" ||
    name === "TimeoutError" ||
    code === "ABORT_ERR"
  ) {
    return new HopError("timeout", "timed out");
  }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN" || code === "ENODATA") {
    return new HopError("dns", "address not found");
  }
  if (
    code.startsWith("ERR_TLS") ||
    code.includes("CERT") ||
    code === "EPROTO"
  ) {
    return new HopError("tls", "certificate problem");
  }
  return new HopError("network", "could not connect");
}

const guardedLookup = createGuardedLookup();

/**
 * One request that only reads the status line and headers: the body is never
 * downloaded (the socket is destroyed as soon as headers arrive).
 */
export function requestHop(
  url: URL,
  method: "HEAD" | "GET",
  timeoutMs: number,
  lookup: LookupFunction = guardedLookup,
): Promise<HopResponse> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    let settled = false;
    const request = client.request(
      url,
      {
        method,
        lookup,
        // No keep-alive pool: every hop gets a fresh, checked connection.
        agent: false,
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
          "Accept-Encoding": "identity",
        },
        maxHeaderSize: 32 * 1024,
      },
      (response) => {
        settled = true;
        const location = response.headers.location;
        resolve({
          status: response.statusCode ?? 0,
          location: (Array.isArray(location) ? location[0] : location) ?? null,
        });
        response.destroy();
        request.destroy();
      },
    );
    request.on("error", (error) => {
      if (!settled) reject(classify(error));
    });
    request.end();
  });
}

// HEAD is answered wrongly by some servers; these mean "try a GET instead".
const RETRY_WITH_GET = new Set([
  400, 403, 404, 405, 406, 409, 429, 500, 501, 502, 503,
]);

/** HEAD first, then a body-less GET when the server won't answer HEAD properly. */
export async function fetchHop(
  url: URL,
  timeoutMs: number,
  request: typeof requestHop = requestHop,
): Promise<HopResponse> {
  const started = Date.now();
  try {
    const head = await request(url, "HEAD", timeoutMs);
    if (!RETRY_WITH_GET.has(head.status)) return head;
  } catch (error) {
    // Only a dropped connection is worth a retry; DNS, TLS and timeouts won't change.
    const hopError = classify(error);
    if (hopError.code !== "network") throw hopError;
  }
  const remaining = timeoutMs - (Date.now() - started);
  if (remaining < 250) throw new HopError("timeout", "timed out");
  return request(url, "GET", remaining);
}
