import type { ContentType, QRContentConfig } from "@/types/qr-content";
import { encodeQRContent } from "@/utils/qr-content-encoder";

/** Encodes a stored form config for the given type ("" when it doesn't match). */
export function toPayload(
  type: ContentType,
  config: QRContentConfig | undefined,
): string {
  if (!config || config.type !== type) return "";
  const encoded = encodeQRContent(config);
  if (!encoded) return "";

  return encoded;
}
