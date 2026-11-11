"use client";

import { Progress } from "@repo/design-system/components/ui/progress";
import { cn } from "@repo/design-system/lib/utils";
import { limitCopy } from "@/app/(app)/settings/usage/_lib/limit-copy";
import {
  type Meter,
  type MeterId,
  meterLabel,
  meterPercent,
  meterValue,
  upgradeTo,
} from "@/app/(app)/settings/usage/_lib/meters";
import { PLAN_NAMES, type Plan } from "@/lib/pricing";
import { usePlanLimits } from "./plan-limits-provider";
import { UpgradeButton } from "./upgrade-button";

/**
 * A capped count at the top of a list (codes, pages): the bar, a warning
 * from 90% in the limit cards' words, and the upgrade when this person can
 * buy the plan that lifts it. Only for a cap; unlimited counts get a line
 * of text instead.
 */
export function CapMeter({
  meterId,
  used,
  limit,
  plan,
  note,
  source,
}: {
  meterId: MeterId;
  used: number;
  limit: number;
  plan: Plan;
  /** Shown below 90% */
  note: string;
  /** For the upgrade click's analytics */
  source: string;
}) {
  const limits = usePlanLimits();
  const meter: Meter = {
    id: meterId,
    label: meterLabel(meterId, { isTeam: limits?.isTeam }),
    used,
    limit,
    unit: "count",
  };
  const cap = limits?.caps[meterId];
  const context = limits && {
    plan,
    canUpgrade: limits.canUpgrade,
    checkoutOpen: limits.checkoutOpen,
    cap,
  };
  const copy = context ? limitCopy(meter, context) : null;
  const upgrade = context
    ? upgradeTo(
        cap?.lift?.plan ?? null,
        context.canUpgrade,
        context.checkoutOpen,
      )
    : null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:gap-6">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="font-medium">
            {meter.label} · {PLAN_NAMES[plan]}
          </span>
          <span
            className={cn(
              "shrink-0 tabular-nums",
              copy ? "text-primary font-medium" : "text-muted-foreground",
            )}
          >
            {meterValue(meter, plan)}
          </span>
        </div>
        <Progress
          aria-label={`${meter.label} used`}
          className={cn(
            "h-1.5",
            !copy &&
              "bg-muted [&_[data-slot=progress-indicator]]:bg-foreground/70",
          )}
          value={meterPercent(meter)}
        />
        <p className="text-muted-foreground text-xs text-pretty">
          {copy ? `${copy.status}. ${copy.reason}` : note}
        </p>
      </div>
      {upgrade && (
        <UpgradeButton
          className="shrink-0 self-start sm:self-center"
          source={source}
          upgrade={upgrade}
          variant="outline"
        />
      )}
    </div>
  );
}
