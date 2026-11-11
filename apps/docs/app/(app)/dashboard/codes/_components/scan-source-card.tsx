import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { cn } from "@repo/design-system/lib/utils";
import type { ReactNode } from "react";
import { use } from "react";
import { getAppTranslations } from "@/lib/i18n/app-locale";
import { SCAN_SOURCE_LABELS } from "@/lib/nfc/links";
import type { ScanSourceCounts } from "@/lib/scans";
import { formatNumber } from "./format";

const SEGMENTS = [
  { key: "qr", swatch: "bg-foreground" },
  { key: "nfc", swatch: "bg-foreground/35" },
] as const;

const percent = (part: number, total: number) =>
  total > 0 ? Math.round((part / total) * 100) : 0;

/**
 * QR scans next to NFC taps for a range: one split bar and the two counts
 * (lib/nfc/links.ts). `action` sits in the header (a link to set up NFC).
 */
export function ScanSourceCard({
  sources,
  description,
  action,
  className,
}: {
  sources: ScanSourceCounts;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  const t = use(getAppTranslations("app.dashboard.codes.scanSourceCard"));
  const total = sources.qr + sources.nfc;
  return (
    <Card className={cn("gap-3 py-4", className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 px-4">
        <div className="min-w-0 space-y-1">
          <CardTitle className="text-sm">{t("qrScansAndNfcTaps")}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {action}
      </CardHeader>
      <CardContent className="space-y-3 px-4">
        <div
          aria-label={t("qrQrScansNfcNfc", {
            qr: formatNumber(sources.qr),
            nfc: formatNumber(sources.nfc),
          })}
          className="bg-muted flex h-2 gap-0.5 overflow-hidden rounded-full"
          role="img"
        >
          {total > 0 &&
            SEGMENTS.map(({ key, swatch }) =>
              sources[key] > 0 ? (
                <span
                  className={cn("h-full", swatch)}
                  key={key}
                  style={{ width: `${(sources[key] / total) * 100}%` }}
                />
              ) : null,
            )}
        </div>
        <dl className="grid grid-cols-2 gap-3">
          {SEGMENTS.map(({ key, swatch }) => (
            <div className="min-w-0 space-y-0.5" key={key}>
              <dt className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <span
                  aria-hidden="true"
                  className={cn("size-2 shrink-0 rounded-full", swatch)}
                />
                {SCAN_SOURCE_LABELS[key]}
              </dt>
              <dd className="flex items-baseline gap-1.5">
                <span className="text-lg font-semibold tabular-nums">
                  {formatNumber(sources[key])}
                </span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {percent(sources[key], total)}%
                </span>
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
