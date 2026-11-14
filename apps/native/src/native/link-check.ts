import { CapacitorHttp } from "@capacitor/core";
import type { LinkCheckResult } from "@/components/scanner/link-check";
import { QRDX_ORIGIN } from "./platform";

// The same safe-link preview as the website (components/scanner/link-check.ts),
// asked of qrdx.dev from the device: only the scanned address is sent, and
// QRdx doesn't keep it. Native HTTP, so no cross-origin rules apply.
export type {
  FindingSeverity,
  LinkCheckResult,
  LinkFinding,
  LinkHop,
  LinkVerdict,
  QrdxCodeInfo,
  QrdxCodeStatus,
} from "@/components/scanner/link-check";

export async function checkLink(
  url: string,
  signal?: AbortSignal
): Promise<LinkCheckResult> {
  if (!navigator.onLine) {
    throw new Error("offline");
  }
  const response = await CapacitorHttp.post({
    url: `${QRDX_ORIGIN}/api/scan/check`,
    headers: { "Content-Type": "application/json" },
    data: { url },
    connectTimeout: 15_000,
    readTimeout: 20_000,
  });
  signal?.throwIfAborted();
  if (response.status === 429) {
    throw new Error("Too many link checks. Wait a minute and try again.");
  }
  if (response.status < 200 || response.status >= 300) {
    throw new Error("The link check failed.");
  }
  return response.data as LinkCheckResult;
}
