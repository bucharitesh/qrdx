import { Badge } from "@repo/design-system/components/ui/badge";
import { useTranslations } from "next-intl";
import type { QrCodeStatus } from "@/app/(app)/dashboard/codes/_lib/qr-codes";

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
  const t = useTranslations("app.dashboard.codes.statusBadge");
  if (paused && status === "active") {
    return (
      <Badge title={t("pausedScansGoToThe")} variant="outline">
        {t("paused")}
      </Badge>
    );
  }
  return (
    <Badge
      title={status === "disabled" ? t("turnedOffByQrdxModeration") : undefined}
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
