import "server-only";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env";

/**
 * Cloudflare R2 (S3 API). File features are hidden unless
 * `isStorageConfigured`; every call below throws StorageNotConfiguredError
 * otherwise. Browsers upload straight to R2 with a presigned PUT, so the
 * bucket's CORS policy must allow PUT with a Content-Type header from the app
 * origin.
 */

const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET,
  R2_PUBLIC_BASE_URL,
} = env;

export const isStorageConfigured = Boolean(
  R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET,
);

export class StorageNotConfiguredError extends Error {
  constructor() {
    super("File storage is not configured");
    this.name = "StorageNotConfiguredError";
  }
}

const UPLOAD_URL_TTL_SECONDS = 10 * 60;
const DOWNLOAD_URL_TTL_SECONDS = 60 * 60;
const MAX_KEY_BYTES = 1024;

let client: S3Client | null = null;

function storage(): { client: S3Client; bucket: string } {
  if (!(isStorageConfigured && R2_BUCKET)) {
    throw new StorageNotConfiguredError();
  }
  client ??= new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID as string,
      secretAccessKey: R2_SECRET_ACCESS_KEY as string,
    },
    // Keep SDK-computed checksums out of presigned URLs: browsers can't send them.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return { client, bucket: R2_BUCKET };
}

function assertKey(key: string) {
  if (
    !key ||
    key.startsWith("/") ||
    new TextEncoder().encode(key).length > MAX_KEY_BYTES ||
    // biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting them is the point
    /[\u0000-\u001f\u007f\\]/.test(key) ||
    key.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new Error(`Invalid storage key "${key}"`);
  }
}

export interface PresignedUpload {
  url: string;
  method: "PUT";
  /** Send exactly these headers with the PUT (they are part of the signature) */
  headers: { "Content-Type": string };
  expiresAt: Date;
}

/**
 * Presigned PUT for one object. `mime` and `size` (bytes) are signed, so R2
 * rejects an upload with a different Content-Type or length. Check `size`
 * against the plan's limits before calling.
 */
export async function presignUpload({
  key,
  mime,
  size,
  expiresIn = UPLOAD_URL_TTL_SECONDS,
}: {
  key: string;
  mime: string;
  size: number;
  expiresIn?: number;
}): Promise<PresignedUpload> {
  assertKey(key);
  if (!Number.isSafeInteger(size) || size <= 0) {
    throw new Error("Upload size must be a positive number of bytes");
  }
  const { client, bucket } = storage();
  const url = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: mime,
      ContentLength: size,
    }),
    { expiresIn, signableHeaders: new Set(["content-type", "content-length"]) },
  );
  return {
    url,
    method: "PUT",
    headers: { "Content-Type": mime },
    expiresAt: new Date(Date.now() + expiresIn * 1000),
  };
}

/** `attachment` disposition with an ASCII fallback plus the UTF-8 name (RFC 6266). */
function attachmentDisposition(filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/**
 * Short-lived GET URL for a private object. Pass `filename` to make browsers
 * download it under that name.
 */
export async function presignDownload(
  key: string,
  {
    filename,
    expiresIn = DOWNLOAD_URL_TTL_SECONDS,
  }: { filename?: string; expiresIn?: number } = {},
): Promise<string> {
  assertKey(key);
  const { client, bucket } = storage();
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ...(filename && {
        ResponseContentDisposition: attachmentDisposition(filename),
      }),
    }),
    { expiresIn },
  );
}

export interface StoredObject {
  size: number;
  mime: string | null;
  etag: string | null;
  lastModified: Date | null;
}

/** Metadata of an object, or null when it doesn't exist (e.g. upload never finished). */
export async function headObject(key: string): Promise<StoredObject | null> {
  assertKey(key);
  const { client, bucket } = storage();
  try {
    const object = await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: key }),
    );
    return {
      size: object.ContentLength ?? 0,
      mime: object.ContentType ?? null,
      etag: object.ETag ?? null,
      lastModified: object.LastModified ?? null,
    };
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } })
      .$metadata?.httpStatusCode;
    if (status === 404 || (error as Error).name === "NotFound") return null;
    throw error;
  }
}

/**
 * Stores a small object sent through the server (a profile picture). Check
 * the bytes before calling; large files go through presignUpload instead.
 */
export async function putObject(
  key: string,
  body: Uint8Array,
  { mime, cacheControl }: { mime: string; cacheControl?: string },
): Promise<void> {
  assertKey(key);
  const { client, bucket } = storage();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: mime,
      ContentLength: body.byteLength,
      ...(cacheControl && { CacheControl: cacheControl }),
    }),
  );
}

/** Deletes an object; deleting a missing key succeeds. */
export async function deleteObject(key: string): Promise<void> {
  assertKey(key);
  const { client, bucket } = storage();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

/**
 * Public URL of an object via R2_PUBLIC_BASE_URL (public bucket or custom
 * domain), or null when unset — then serve files with presignDownload.
 */
export function publicUrl(key: string): string | null {
  assertKey(key);
  if (!R2_PUBLIC_BASE_URL) return null;
  const base = R2_PUBLIC_BASE_URL.replace(/\/+$/, "");
  return `${base}/${key.split("/").map(encodeURIComponent).join("/")}`;
}
