import { notFound } from "next/navigation";
import AuditLogSettingsPage from "@/ee/audit-log/settings-page";
import { isFeatureAvailable } from "@/lib/feature-availability";

export { metadata } from "@/ee/audit-log/settings-page";

/**
 * Settings → Audit log (ee/audit-log, QRdx commercial licence). Not found on
 * servers without a licence key, where nothing is recorded.
 */
export default function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!isFeatureAvailable("auditLog")) notFound();
  return <AuditLogSettingsPage searchParams={searchParams} />;
}
