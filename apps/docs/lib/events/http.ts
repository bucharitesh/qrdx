import "server-only";

import { request } from "node:https";
import { isOutboundDeliveryAllowed } from "@/lib/delivery-guard";
import { checkWebhookUrl, safeLookup } from "./url-safety";

export const WEBHOOK_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 2048;

export const WEBHOOK_USER_AGENT =
  "QRdx-Webhooks/1.0 (+https://qrdx.dev/docs/webhooks)";

export type PostResult =
  | { ok: true; status: number; durationMs: number }
  | { ok: false; status: number | null; error: string; durationMs: number };

/** Test seam: replaced by tests so nothing touches the network. */
export type Transport = (
  url: URL,
  body: string,
  headers: Record<string, string>,
  timeoutMs: number,
) => Promise<{ status: number; body: string }>;

const httpsTransport: Transport = (url, body, headers, timeoutMs) =>
  new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: "POST",
        headers: {
          ...headers,
          "Content-Length": Buffer.byteLength(body).toString(),
        },
        // Resolved addresses are re-checked on every connection.
        lookup: safeLookup as never,
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          if (size < MAX_RESPONSE_BYTES) {
            chunks.push(chunk);
            size += chunk.length;
          }
        });
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8").slice(0, 500),
          }),
        );
        res.on("error", reject);
      },
    );
    // Hard deadline for the whole exchange, not just socket idle time.
    const deadline = setTimeout(
      () => req.destroy(new Error("Timed out")),
      timeoutMs,
    );
    req.on("timeout", () => req.destroy(new Error("Timed out")));
    req.on("error", (error) => {
      clearTimeout(deadline);
      reject(error);
    });
    req.on("close", () => clearTimeout(deadline));
    req.end(body);
  });

let transport: Transport = httpsTransport;

export function setTransportForTests(next: Transport | null) {
  transport = next ?? httpsTransport;
}

function describeError(error: unknown): string {
  const code = (error as NodeJS.ErrnoException)?.code;
  if (code === "EBLOCKEDADDRESS") return "Blocked: private or reserved address";
  if (code === "ENOTFOUND") return "Host not found";
  if (code === "ECONNREFUSED") return "Connection refused";
  if (code === "ECONNRESET") return "Connection reset";
  if (code?.startsWith("ERR_TLS") || code === "CERT_HAS_EXPIRED") {
    return "TLS certificate error";
  }
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 200) || "Request failed";
}

/**
 * POSTs JSON to a customer-supplied https URL: no redirects followed, private
 * addresses refused, 10 s deadline, 2xx = success. Never throws.
 */
export async function postJson(
  target: string,
  body: string,
  headers: Record<string, string>,
  timeoutMs = WEBHOOK_TIMEOUT_MS,
): Promise<PostResult> {
  const started = Date.now();
  const checked = checkWebhookUrl(target);
  if (!checked.ok) {
    return { ok: false, status: null, error: checked.message, durationMs: 0 };
  }
  // The guard protects the real network; a transport injected by tests never
  // leaves the process.
  if (transport === httpsTransport && !isOutboundDeliveryAllowed()) {
    return {
      ok: false,
      status: null,
      error: "Delivery is disabled outside production",
      durationMs: 0,
    };
  }
  try {
    const response = await transport(
      checked.url,
      body,
      {
        "Content-Type": "application/json",
        "User-Agent": WEBHOOK_USER_AGENT,
        ...headers,
      },
      timeoutMs,
    );
    const durationMs = Date.now() - started;
    if (response.status >= 200 && response.status < 300) {
      return { ok: true, status: response.status, durationMs };
    }
    const reason =
      response.status >= 300 && response.status < 400
        ? "redirects are not followed"
        : response.body.replace(/\s+/g, " ").trim().slice(0, 200);
    return {
      ok: false,
      status: response.status,
      error: `HTTP ${response.status}${reason ? `: ${reason}` : ""}`,
      durationMs,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      error: describeError(error),
      durationMs: Date.now() - started,
    };
  }
}
