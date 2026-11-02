import { Progress } from "@repo/design-system/components/ui/progress";
import { cn } from "@repo/design-system/lib/utils";
import type { Plan } from "@/lib/pricing";
import {
  meterLevel,
  meterPercent,
  meterValue,
  resetLine,
} from "../_lib/meters";
import type { MeterResult } from "../_lib/plan-usage";

const LEVEL_TEXT = {
  near: "Almost full",
  full: "Limit reached",
} as const;

function MeterRow({ meter, plan }: { meter: MeterResult; plan: Plan }) {
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
  const warn = level === "near" || level === "full";
  const details = [
    warn ? LEVEL_TEXT[level] : null,
    resetLine(meter.resetsAt),
    meter.note ?? null,
  ].filter(Boolean);

  return (
    <li className="space-y-2 py-4">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm font-medium">{meter.label}</span>
        <span
          className={cn(
            "shrink-0 text-sm",
            level === "excluded" ? "text-muted-foreground" : "font-medium",
            warn && "text-primary",
          )}
        >
          {meterValue(meter, plan)}
        </span>
      </div>
      {capped && (
        <Progress
          aria-label={`${meter.label} used`}
          className={cn(
            "h-1.5",
            !warn &&
              "bg-muted [&_[data-slot=progress-indicator]]:bg-foreground/70",
          )}
          value={meterPercent(meter)}
        />
      )}
      {details.length > 0 && (
        <p className="text-muted-foreground text-xs">{details.join(" · ")}</p>
      )}
    </li>
  );
}

/** Every counted limit of the workspace's plan, one row each. */
export function UsageMeters({
  meters,
  plan,
}: {
  meters: MeterResult[];
  plan: Plan;
}) {
  return (
    <ul className="divide-y">
      {meters.map((meter) => (
        <MeterRow key={meter.id} meter={meter} plan={plan} />
      ))}
    </ul>
  );
}
