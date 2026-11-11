/** biome-ignore-all lint/suspicious/noBitwiseOperators: FNV-1a */
import type { FrameSpec } from "../../types/frame-spec";

/** JSON with object keys sorted, so key order never changes the hash. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value)
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .sort();
    return `{${keys
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * A short fingerprint of a spec (FNV-1a over its JSON with sorted keys), so
 * a picker can tell an unchanged official frame without loading every spec,
 * even after a database has reordered its keys. Not for security.
 */
export function frameSpecHash(spec: FrameSpec): string {
  const text = stableJson(spec);
  let hash = 0x81_1c_9d_c5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01_00_01_93) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
