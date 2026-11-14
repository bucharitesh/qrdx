import { formatBytes } from "./types";

/**
 * Storage rules per plan (lib/plans `storageBytes` / `maxFileBytes`). Limits
 * only stop new uploads: files already stored keep being served after a
 * downgrade, even when the workspace is over its quota.
 */

export interface StorageLimits {
  /** Total bytes per workspace; Infinity = unlimited */
  storageBytes: number;
  /** Largest single file */
  maxFileBytes: number;
}

export type UploadCheck =
  | { ok: true }
  | {
      ok: false;
      code: "FILE_TOO_LARGE" | "QUOTA_EXCEEDED";
      message: string;
    };

/**
 * Whether a new upload of `size` bytes fits. `replacingBytes` is the size of
 * the file being replaced (freed when the replacement is stored).
 */
export function checkUpload({
  limits,
  usedBytes,
  size,
  replacingBytes = 0,
  planName,
}: {
  limits: StorageLimits;
  usedBytes: number;
  size: number;
  replacingBytes?: number;
  planName: string;
}): UploadCheck {
  if (size > limits.maxFileBytes) {
    return {
      ok: false,
      code: "FILE_TOO_LARGE",
      message: `Files can be up to ${formatBytes(limits.maxFileBytes)} on ${planName}. This one is ${formatBytes(size)}.`,
    };
  }
  if (!Number.isFinite(limits.storageBytes)) return { ok: true };
  const after = Math.max(0, usedBytes - replacingBytes) + size;
  if (after > limits.storageBytes) {
    const free = Math.max(0, limits.storageBytes - usedBytes + replacingBytes);
    return {
      ok: false,
      code: "QUOTA_EXCEEDED",
      message: `Not enough storage: ${formatBytes(free)} of ${formatBytes(limits.storageBytes)} left on ${planName}. Delete files you no longer need${planName === "Business" ? "" : " or upgrade"} to upload this one.`,
    };
  }
  return { ok: true };
}

/** 0–100 for a usage meter (100 when over quota, 0 when unlimited). */
export function usagePercent(usedBytes: number, storageBytes: number): number {
  if (!Number.isFinite(storageBytes) || storageBytes <= 0) return 0;
  return Math.min(100, Math.round((usedBytes / storageBytes) * 1000) / 10);
}
