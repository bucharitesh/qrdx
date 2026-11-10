import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import Link from "next/link";
import { formatNumber } from "@/app/dashboard/codes/_components/format";
import { codeTabHref } from "@/app/dashboard/codes/_lib/code-tabs";
import type { QrCodeView } from "@/app/dashboard/codes/_lib/qr-codes";
import { cheapestPlanWith, getPlanForScope, getPlanLimits } from "@/lib/plans";
import { type PaidPlan, PLAN_NAMES } from "@/lib/pricing";
import { getPreciseLocations, type PreciseLocationSummary } from "@/lib/scans";
import { getActiveScope } from "@/lib/scope";
import { PreciseLocationsTable } from "./precise-locations-table";
import { PlanLock } from "./routing-panel";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-xl font-bold tracking-tight tabular-nums">{value}</p>
    </div>
  );
}

function percent(part: number, whole: number): string {
  if (whole === 0) return "—";
  return `${Math.round((part / whole) * 100)}%`;
}

/**
 * Locations scanners chose to share (lib/scan-location), kept apart from the
 * IP-based countries and cities: how many were asked, how many shared, and
 * every shared point (rounded to ~100 m) with its scans.
 */
export async function PreciseLocationsCard({
  code,
  from,
  days,
  slug,
}: {
  code: QrCodeView;
  from: Date;
  days: number;
  slug: string | null;
}) {
  const plan = await getPlanForScope(await getActiveScope());
  const included = getPlanLimits(plan).preciseLocation;
  let summary: PreciseLocationSummary | null = null;
  if (included) {
    try {
      summary = await getPreciseLocations(code.id, from);
    } catch (error) {
      console.error("Analytics (precise locations) failed:", error);
    }
  }
  const settingsHref = codeTabHref(slug, code.id, "settings", {
    hash: "location",
  });
  const required = cheapestPlanWith((limits) => limits.preciseLocation);
  const upgradePlan: PaidPlan | null =
    required && required !== "free" ? required : null;

  let body: React.ReactNode;
  if (!included) {
    body = upgradePlan ? (
      <PlanLock plan={upgradePlan}>
        Precise scan locations, from scanners who choose to share them, are part
        of {PLAN_NAMES[upgradePlan]}.
      </PlanLock>
    ) : null;
  } else if (!summary) {
    body = (
      <p className="text-muted-foreground text-sm">
        Precise locations couldn't be loaded right now.
      </p>
    );
  } else if (summary.asked === 0) {
    body = (
      <p className="text-muted-foreground text-sm">
        {code.preciseLocation
          ? `No scans asked for a location in the last ${days} days yet.`
          : "This code doesn't ask scanners for their location."}{" "}
        {!code.preciseLocation && (
          <Link className="text-foreground underline" href={settingsHref}>
            Turn it on in Settings
          </Link>
        )}
      </p>
    );
  } else {
    body = (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <Stat label="Asked" value={formatNumber(summary.asked)} />
          <Stat label="Shared" value={formatNumber(summary.shared)} />
          <Stat
            label="Allowed"
            value={percent(summary.shared, summary.asked)}
          />
        </div>
        {summary.points.length > 0 ? (
          <PreciseLocationsTable
            rows={summary.points.map((point) => ({
              ...point,
              lastScannedAt: point.lastScannedAt.toISOString(),
            }))}
          />
        ) : (
          <p className="text-muted-foreground text-sm">
            No one shared their location in this period.
          </p>
        )}
      </div>
    );
  }
  if (!body) return null;

  return (
    <Card className="gap-4 py-4" id="precise-locations">
      <CardHeader className="px-4">
        <CardTitle>Precise locations</CardTitle>
        <CardDescription>
          Shared by scanners who allowed it, rounded to about 100 m. Separate
          from the IP-based countries and cities above. Last {days} days.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4">{body}</CardContent>
    </Card>
  );
}
