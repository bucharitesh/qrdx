import { Badge } from "@repo/design-system/components/ui/badge";
import type { QrCodeStatus } from "@/app/dashboard/codes/_lib/qr-codes";

const LABELS: Record<QrCodeStatus, string> = {
  active: "Active",
  archived: "Archived",
  disabled: "Disabled",
};

export function StatusBadge({
  status,
  paused = false,
}: {
  status: QrCodeStatus;
  /** Shown instead of "Active" for paused codes */
  paused?: boolean;
}) {
  if (paused && status === "active") {
    return (
      <Badge
        title="Paused: scans go to the fallback URL or a neutral 'paused' page"
        variant="outline"
      >
        Paused
      </Badge>
    );
  }
  return (
    <Badge
      title={
        status === "disabled"
          ? "Turned off by QRdx moderation. Contact support if this is a mistake."
          : undefined
      }
      variant={
        status === "active"
          ? "secondary"
          : status === "disabled"
            ? "destructive"
            : "outline"
      }
    >
      {LABELS[status]}
    </Badge>
  );
}
