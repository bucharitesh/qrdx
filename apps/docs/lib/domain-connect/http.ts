import "server-only";

import https from "node:https";
import {
  createGuardedLookup,
  fetchBlockReason,
} from "@/app/api/scan/check/_lib/ssrf";
import type { HttpResult } from "./discovery";

// GETs for Domain Connect discovery. The URLs come from customers' DNS, so
// the request only connects to public addresses (checked at connect time,
// which also defeats DNS rebinding), follows no redirects, and reads at most
// MAX_BODY_BYTES.

const TIMEOUT_MS = 4000;
const MAX_BODY_BYTES = 64 * 1024;
const USER_AGENT =
  "QRdx-DomainConnect/1.0 (+https://qrdx.dev/docs/custom-domains)";

const lookup = createGuardedLookup();

export function getJson(url: URL): Promise<HttpResult> {
  if (url.protocol !== "https:" || fetchBlockReason(url)) {
    return Promise.reject(new Error("URL not allowed"));
  }
  return new Promise((resolve, reject) => {
    const request = https.request(
      url,
      {
        method: "GET",
        lookup,
        agent: false,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        maxHeaderSize: 16 * 1024,
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "identity",
          "User-Agent": USER_AGENT,
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BODY_BYTES) {
            request.destroy(new Error("response too large"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let body: unknown = null;
          try {
            body = text ? JSON.parse(text) : null;
          } catch {
            // Not JSON: the caller sees body null.
          }
          resolve({ status: response.statusCode ?? 0, body });
        });
        response.on("error", reject);
      },
    );
    request.on("error", reject);
    request.end();
  });
}
