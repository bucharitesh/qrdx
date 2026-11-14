// The audit log's CSV export (Settings → Audit log → Export CSV). Pure: the
// route streams these lines. Every value goes through `csvCell`, which keeps
// spreadsheets from running a cell as a formula.

import {
  AUDIT_CATEGORY_LABELS,
  auditCategoryOf,
  auditSentence,
} from "./catalogue";

export interface AuditCsvRow {
  createdAt: Date;
  action: string;
  actorType: string;
  actorLabel: string | null;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
  apiKeyId: string | null;
  oauthAppId: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  device: string | null;
}

export const AUDIT_CSV_HEADERS = [
  "Time (UTC)",
  "Category",
  "Action",
  "Description",
  "Actor type",
  "Actor",
  "API key ID",
  "OAuth app ID",
  "Target type",
  "Target",
  "Target ID",
  "IP address",
  "Device",
  "Details",
] as const;

/**
 * One CSV cell. Text starting with =, +, -, @, a tab or a carriage return is
 * prefixed with ' so Excel, Numbers and Sheets show it instead of running it
 * (the names and URLs here are typed by workspace members).
 */
export function csvCell(value: unknown): string {
  let text = value instanceof Date ? value.toISOString() : String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const ACTOR_TYPES: Record<string, string> = {
  user: "Person",
  api_key: "API key",
  oauth_app: "OAuth app",
  slack: "Slack",
  system: "System",
};

/** A line of cells, ended with CRLF as RFC 4180 has it. */
export function csvLine(cells: readonly unknown[]): string {
  return `${cells.map(csvCell).join(",")}\r\n`;
}

export function auditCsvLine(row: AuditCsvRow): string {
  const category = auditCategoryOf(row.action);
  return csvLine([
    row.createdAt.toISOString(),
    category ? AUDIT_CATEGORY_LABELS[category] : "",
    row.action,
    auditSentence(row.action, {
      type: row.targetType,
      label: row.targetLabel,
    }),
    ACTOR_TYPES[row.actorType] ?? row.actorType,
    row.actorLabel ?? "",
    row.apiKeyId ?? "",
    row.oauthAppId ?? "",
    row.targetType ?? "",
    row.targetLabel ?? "",
    row.targetId ?? "",
    row.ip ?? "",
    row.device ?? "",
    row.metadata && Object.keys(row.metadata).length > 0
      ? JSON.stringify(row.metadata)
      : "",
  ]);
}

/** "acme-audit-log-2026-11-09.csv" */
export function auditCsvFilename(slug: string, now: Date): string {
  const safe =
    slug
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "workspace";
  return `qrdx-${safe}-audit-log-${now.toISOString().slice(0, 10)}.csv`;
}
