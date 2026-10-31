// Shared by the scanner UI and POST /api/scan/check (types + client call).

export type LinkVerdict = "verified" | "ok" | "caution" | "danger" | "unknown";

export type FindingSeverity = "info" | "warning" | "danger";

export interface LinkFinding {
  severity: FindingSeverity;
  code: string;
  message: string;
}

export interface LinkHop {
  url: string;
  /** HTTP status, null when the hop was resolved without a request (QRdx codes). */
  status: number | null;
}

export type QrdxCodeStatus =
  | "active"
  | "password"
  | "ended"
  | "inactive"
  | "not-found";

export interface QrdxCodeInfo {
  slug: string;
  /** Real, active QRdx code with no open abuse reports. */
  verified: boolean;
  status: QrdxCodeStatus;
  kind: "redirect" | "page";
  /** Device, location, time or A/B rules may change the destination. */
  hasRules: boolean;
}

export interface LinkCheckResult {
  url: string;
  /** Where the link ends up; null when it can't be shown (password-protected code). */
  finalUrl: string | null;
  hops: LinkHop[];
  /** False when the chain could not be followed to the end. */
  complete: boolean;
  verdict: LinkVerdict;
  findings: LinkFinding[];
  /** "not-checked": nothing needed a lookup (QRdx links, local addresses). */
  webRisk:
    | "clean"
    | "threat"
    | "unavailable"
    | "not-checked"
    | "not-configured";
  qrdx: QrdxCodeInfo | null;
}

export async function checkLink(
  url: string,
  signal?: AbortSignal,
): Promise<LinkCheckResult> {
  const response = await fetch("/api/scan/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
    signal,
  });
  if (response.status === 429) {
    throw new Error("Too many link checks. Wait a minute and try again.");
  }
  if (!response.ok) {
    throw new Error("The link check failed.");
  }
  return (await response.json()) as LinkCheckResult;
}
