/** Parsing of Content-Security-Policy violation reports (app/api/csp-report). */

type Raw = Record<string, unknown>;

const MAX_REPORTS = 5;

const text = (value: unknown, max = 200) =>
  typeof value === "string" ? value.slice(0, max) : undefined;

/** Origin of a URL, or a keyword such as "inline", "eval" or "data". */
function source(value: unknown): string | undefined {
  const raw = text(value, 2048);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return url.origin === "null" ? url.protocol.replace(/:$/, "") : url.origin;
  } catch {
    return raw.slice(0, 40);
  }
}

function path(value: unknown): string | undefined {
  const raw = text(value, 2048);
  if (!raw) return undefined;
  try {
    return new URL(raw).pathname.slice(0, 200);
  } catch {
    return undefined;
  }
}

export interface CspViolation {
  directive?: string;
  blocked?: string;
  page?: string;
  disposition?: string;
  sample?: string;
}

/** Both report formats: legacy `{ "csp-report": … }` and Reporting API arrays. */
export function parseCspReports(body: unknown): CspViolation[] {
  const entries: Raw[] = [];
  if (Array.isArray(body)) {
    for (const item of body) {
      if (
        item &&
        typeof item === "object" &&
        (item as Raw).type === "csp-violation"
      ) {
        const report = (item as Raw).body;
        if (report && typeof report === "object") entries.push(report as Raw);
      }
    }
  } else if (body && typeof body === "object") {
    const legacy = (body as Raw)["csp-report"];
    if (legacy && typeof legacy === "object") entries.push(legacy as Raw);
  }
  return entries.slice(0, MAX_REPORTS).map((entry) => ({
    directive: text(
      entry.effectiveDirective ??
        entry["effective-directive"] ??
        entry["violated-directive"],
      60,
    ),
    blocked: source(entry.blockedURL ?? entry["blocked-uri"]),
    page: path(entry.documentURL ?? entry["document-uri"]),
    disposition: text(entry.disposition, 20),
    // Browsers send the first 40 characters of inline code; keep a few.
    sample: text(entry.sample ?? entry["script-sample"], 40),
  }));
}
