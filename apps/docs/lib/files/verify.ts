import "server-only";

import { createHash } from "node:crypto";
import { headObject, presignDownload } from "@/lib/storage/r2";
import { matchesDeclaredType, SNIFF_BYTES } from "./magic";
import { type AllowedMime, normalizeMime } from "./types";

/** Files up to this size are hashed (SHA-256) when an upload is finalized. */
export const HASH_MAX_BYTES = 25 * 1024 * 1024;

const READ_TIMEOUT_MS = 30_000;

export type VerifyResult =
  | { ok: true; sha256: string | null }
  | {
      ok: false;
      /** missing: nothing uploaded (yet); the rest mean the upload is rejected */
      reason: "missing" | "size" | "mime" | "type";
    };

/** First `limit` bytes of a stream, cancelling the rest. */
async function readPrefix(
  body: ReadableStream<Uint8Array>,
  limit: number,
): Promise<Uint8Array> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (received < limit) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks).subarray(0, limit);
}

/** SHA-256 of a whole stream plus its first `prefixBytes` bytes. */
async function hashStream(
  body: ReadableStream<Uint8Array>,
  prefixBytes: number,
  maxBytes: number,
): Promise<{ sha256: string; prefix: Uint8Array; size: number }> {
  const hash = createHash("sha256");
  const prefix: Uint8Array[] = [];
  let prefixLength = 0;
  let size = 0;
  const reader = body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new Error("Stored object is larger than expected");
    }
    hash.update(value);
    if (prefixLength < prefixBytes) {
      prefix.push(value);
      prefixLength += value.byteLength;
    }
  }
  return {
    sha256: hash.digest("hex"),
    prefix: Buffer.concat(prefix).subarray(0, prefixBytes),
    size,
  };
}

/**
 * Checks an uploaded object against what the client declared: it exists, has
 * exactly `size` bytes and the declared Content-Type, and its first bytes are
 * a file of the declared kind. Small files are hashed too (for blocking
 * re-uploads of removed content). Reads go through a short-lived presigned
 * GET, never a user-supplied URL.
 */
export async function verifyStoredObject({
  key,
  size,
  mime,
}: {
  key: string;
  size: number;
  mime: AllowedMime;
}): Promise<VerifyResult> {
  const stored = await headObject(key);
  if (!stored) return { ok: false, reason: "missing" };
  if (stored.size !== size) return { ok: false, reason: "size" };
  if (stored.mime && normalizeMime(stored.mime, "") !== mime) {
    return { ok: false, reason: "mime" };
  }

  const url = await presignDownload(key, { expiresIn: 120 });
  const hashWhole = size <= HASH_MAX_BYTES;
  const response = await fetch(url, {
    headers: hashWhole ? {} : { Range: `bytes=0-${SNIFF_BYTES - 1}` },
    cache: "no-store",
    signal: AbortSignal.timeout(READ_TIMEOUT_MS),
  });
  if (response.status === 404) return { ok: false, reason: "missing" };
  if (!(response.ok && response.body)) {
    throw new Error(`Reading the uploaded file failed (${response.status})`);
  }

  if (hashWhole && response.status === 200) {
    const hashed = await hashStream(response.body, SNIFF_BYTES, size);
    if (hashed.size !== size) return { ok: false, reason: "size" };
    return matchesDeclaredType(mime, hashed.prefix)
      ? { ok: true, sha256: hashed.sha256 }
      : { ok: false, reason: "type" };
  }

  const prefix = await readPrefix(response.body, SNIFF_BYTES);
  return matchesDeclaredType(mime, prefix)
    ? { ok: true, sha256: null }
    : { ok: false, reason: "type" };
}
