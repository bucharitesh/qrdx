import { exportAuditLog } from "@/ee/audit-log/export";

export const dynamic = "force-dynamic";

/**
 * The audit log as CSV, for the filter in the query (ee/audit-log/export.ts).
 * 404 on servers without a licence key, 403 for members and for workspaces
 * without the plan.
 */
export function GET(request: Request) {
  return exportAuditLog(request);
}
