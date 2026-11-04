import "server-only";

import http, { type IncomingMessage } from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import zlib from "node:zlib";
import {
  createGuardedLookup,
  fetchBlockReason,
} from "@/app/api/scan/check/_lib/ssrf";
import { extractPageTitle } from "./prompt";

// The destination's page title, for better suggestions, read with the same
// SSRF rules as the /scan link checker (app/api/scan/check/_lib/ssrf.ts):
// http(s) on default ports only, no credentials, no private or reserved
// addresses (checked on the URL and again on every DNS answer at connect
// time), at most a few redirects, a short timeout, and only the first bytes
// of an HTML response. Any problem means "no title", never an error.

const TIMEOUT_MS = 2500;
const MAX_REDIRECTS = 3;
/** Titles sit in <head>; this is plenty and keeps the download tiny. */
const MAX_BYTES = 48 * 1024;

const USER_AGENT =
  "Mozilla/5.0 (compatible; QRdxLinkPreview/1.0; +https://qrdx.dev/scan)";

const guardedLookup = createGuardedLookup();

interface Head {
  status: number;
  location: string | null;
  body: string | null;
}

/** One GET: the status, a redirect target, or the first bytes of HTML. */
function getOnce(
  url: URL,
  signal: AbortSignal,
  lookup: LookupFunction,
): Promise<Head> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const request = client.request(
      url,
      {
        method: "GET",
        lookup,
        agent: false,
        signal,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml;q=0.9",
          "Accept-Encoding": "gzip, deflate, br",
        },
        maxHeaderSize: 32 * 1024,
      },
      (response) => {
        const status = response.statusCode ?? 0;
        const location = response.headers.location ?? null;
        const type = String(response.headers["content-type"] ?? "");
        if (status >= 300 && status < 400) {
          response.destroy();
          resolve({ status, location, body: null });
          return;
        }
        if (status !== 200 || !/text\/html|application\/xhtml/i.test(type)) {
          response.destroy();
          resolve({ status, location: null, body: null });
          return;
        }
        readStart(response).then(
          (body) => resolve({ status, location: null, body }),
          reject,
        );
      },
    );
    request.on("error", reject);
    request.end();
  });
}

/** Up to MAX_BYTES of the (decompressed) body, then the socket is closed. */
function readStart(response: IncomingMessage): Promise<string> {
  const encoding = String(response.headers["content-encoding"] ?? "")
    .trim()
    .toLowerCase();
  const stream =
    encoding === "gzip" || encoding === "x-gzip"
      ? response.pipe(zlib.createGunzip())
      : encoding === "deflate"
        ? response.pipe(zlib.createInflate())
        : encoding === "br"
          ? response.pipe(zlib.createBrotliDecompress())
          : response;
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      response.destroy();
      resolve(Buffer.concat(chunks).toString("utf8"));
    };
    stream.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      size += chunk.length;
      if (size >= MAX_BYTES) finish();
    });
    stream.on("end", finish);
    stream.on("error", finish);
    response.on("error", finish);
    // Aborted by the timeout: keep what arrived.
    response.on("close", finish);
  });
}

export interface PageTitleDeps {
  /** Tests replace the network with a fake. */
  get?: (url: URL, signal: AbortSignal) => Promise<Head>;
}

/**
 * The page's title (og:title, else <title>), or null when it can't be read
 * safely and quickly.
 */
export async function fetchPageTitle(
  start: URL,
  {
    get = (url, signal) => getOnce(url, signal, guardedLookup),
  }: PageTitleDeps = {},
): Promise<string | null> {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let current = start;
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (fetchBlockReason(current)) return null;
      const head = await get(current, signal);
      if (head.body !== null) return extractPageTitle(head.body);
      if (!head.location) return null;
      current = new URL(head.location, current);
    }
  } catch {
    // Timeouts, DNS, TLS, blocked addresses: no title.
  }
  return null;
}
