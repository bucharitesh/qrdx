import { randomBytes } from "node:crypto";

/**
 * Where uploaded files live in the bucket. The bucket is public (anyone with
 * a key's URL can read it), so a key's prefix decides what is reachable:
 *
 *   staging/<scope>/<id>/<name>      browser upload target (presigned PUT)
 *   <scope>/<id>/<name>              the checked file, served by /api/files
 *   quarantine/<token>/<scope>/...   a blocked file, kept for restore
 *
 * Finalizing copies the checked bytes out of staging, so the presigned PUT
 * (valid for minutes) can never overwrite a ready file. Blocking moves the
 * object under an unguessable quarantine token, so its old public URL stops
 * serving it.
 */

export const STAGING_PREFIX = "staging/";
export const QUARANTINE_PREFIX = "quarantine/";

/** The upload target for a file whose checked copy will live at `finalKey`. */
export function stagingKey(finalKey: string): string {
  return `${STAGING_PREFIX}${finalKey}`;
}

export function isStagingKey(key: string): boolean {
  return key.startsWith(STAGING_PREFIX);
}

/**
 * Where a pending upload's checked copy goes. Uploads created before staging
 * existed already sit at their final key.
 */
export function finalKeyFor(key: string): string {
  return isStagingKey(key) ? key.slice(STAGING_PREFIX.length) : key;
}

export function isQuarantineKey(key: string): boolean {
  return key.startsWith(QUARANTINE_PREFIX);
}

/** A new quarantine key for `key` (random token: not derivable from the old URL). */
export function quarantineKey(
  key: string,
  token: string = randomBytes(18).toString("base64url"),
): string {
  return `${QUARANTINE_PREFIX}${token}/${key}`;
}

/** The key a quarantined file is restored to (its original key). */
export function releasedKey(key: string): string {
  if (!isQuarantineKey(key)) return key;
  const rest = key.slice(QUARANTINE_PREFIX.length);
  const slash = rest.indexOf("/");
  return slash === -1 ? key : rest.slice(slash + 1);
}
