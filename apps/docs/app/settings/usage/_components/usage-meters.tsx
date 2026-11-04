import { Progress } from "@repo/design-system/components/ui/progress";
import { cn } from "@repo/design-system/lib/utils";
import { UpgradeButton } from "@/components/limits/upgrade-button";
import { formatBytes } from "@/lib/files/types";
import { PLAN_NAMES, type Plan } from "@/lib/pricing";
import { type LimitContext, limitCopy } from "../_lib/limit-copy";
import {
  type Meter,
  type MeterCaps,
  type MeterResult,
  meterLevel,
  meterPercent,
  meterValue,
  resetLine,
  splitUnlimited,
} from "../_lib/meters";

/** What a warning row needs to say why and offer the upgrade. */
export type UsageContext = Omit<LimitContext, "cap"> & { caps: MeterCaps };

function MeterRow({
  meter,
  context,
}: {
  meter: MeterResult;
  context: UsageContext;
}) {
  if ("failed" in meter) {
    return (
      <li className="space-y-1 py-4">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-sm font-medium">{meter.label}</span>
          <span className="text-muted-foreground text-sm">Couldn't load</span>
        </div>
        <p className="text-muted-foreground text-xs">
          Refresh to try again. Your plan and limits are unchanged.
        </p>
      </li>
    );
  }

  const level = meterLevel(meter);
  const capped = level === "ok" || level === "near" || level === "full";
  // At 90% or more: the same words as the app's limit cards, and the upgrade.
  const copy = limitCopy(meter, { ...context, cap: context.caps[meter.id] });
  const details = [
    copy?.status ?? null,
    copy ? null : resetLine(meter.resetsAt),
    meter.note ?? null,
  ].filter(Boolean);

  return (
    <li className="space-y-2 py-4">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm font-medium">{meter.label}</span>
        <span
          className={cn(
            "shrink-0 text-sm tabular-nums",
            level === "excluded" ? "text-muted-foreground" : "font-medium",
            copy && "text-primary",
          )}
        >
          {meterValue(meter, context.plan)}
        </span>
      </div>
      {capped && (
        <Progress
          aria-label={`${meter.label} used`}
          className={cn(
            "h-1.5",
            !copy &&
              "bg-muted [&_[data-slot=progress-indicator]]:bg-foreground/70",
          )}
          value={meterPercent(meter)}
        />
      )}
      {details.length > 0 && (
        <p className="text-muted-foreground text-xs">{details.join(" · ")}</p>
      )}
      {copy && (
        <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-start sm:justify-between">
          <p className="text-muted-foreground max-w-prose text-sm text-pretty">
            {copy.reason}
          </p>
          {copy.upgrade && (
            <UpgradeButton
              className="shrink-0 self-start"
              source="usage_page"
              upgrade={copy.upgrade}
              variant="outline"
            />
          )}
        </div>
      )}
    </li>
  );
}

const unlimitedCount = (meter: Meter) =>
  meter.unit === "bytes"
    ? formatBytes(meter.used)
    : meter.used.toLocaleString("en-US");

/** What the plan doesn't cap: counts only, no bars. */
function UnlimitedRow({ meters, plan }: { meters: Meter[]; plan: Plan }) {
  return (
    <li className="space-y-2 py-4">
      <span className="text-sm font-medium">
        Unlimited on {PLAN_NAMES[plan]}
      </span>
      <ul className="grid gap-x-8 gap-y-1.5 sm:grid-cols-2">
        {meters.map((meter) => (
          <li
            className="flex items-baseline justify-between gap-4 text-sm"
            key={meter.id}
          >
            <span className="text-muted-foreground truncate">
              {meter.label}
            </span>
            <span className="shrink-0 tabular-nums">
              {unlimitedCount(meter)}
            </span>
          </li>
        ))}
      </ul>
    </li>
  );
}

/**
 * Every counted limit of the workspace's plan: a bar for each cap (warning
 * from 90%, with the reason and the upgrade), and one line for everything
 * the plan doesn't cap.
 */
export function UsageMeters({
  meters,
  context,
}: {
  meters: MeterResult[];
  context: UsageContext;
}) {
  const { capped, unlimited } = splitUnlimited(meters);
  return (
    <ul className="divide-y">
      {capped.map((meter) => (
        <MeterRow context={context} key={meter.id} meter={meter} />
      ))}
      {unlimited.length > 0 && (
        <UnlimitedRow meters={unlimited} plan={context.plan} />
      )}
    </ul>
  );
}
