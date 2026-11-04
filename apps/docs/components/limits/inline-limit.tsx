"use client";

import { cn } from "@repo/design-system/lib/utils";
import type { ReactNode } from "react";
import { limitCopy } from "@/app/settings/usage/_lib/limit-copy";
import type { MeterId } from "@/app/settings/usage/_lib/meters";
import { LimitCard } from "./limit-card";
import { limitRequestMeter } from "./limit-request";
import { usePlanLimits } from "./plan-limits-provider";

/**
 * The limit card in place, for a cap that's reached where the person is
 * (a form, a dialog). Outside the app shell, or for a cap the plan doesn't
 * have here, `fallback` (the surface's own message) instead.
 */
export function InlineLimit({
  meterId,
  used,
  fallback = null,
  className,
}: {
  /** Null shows the fallback (an error that isn't a limit) */
  meterId: MeterId | null;
  /** The count now, when known; else it's at the cap */
  used?: number;
  fallback?: ReactNode;
  className?: string;
}) {
  const limits = usePlanLimits();
  const meter =
    limits && meterId ? limitRequestMeter({ meterId, used }, limits) : null;
  const copy =
    meter && limits
      ? limitCopy(meter, {
          plan: limits.plan,
          canUpgrade: limits.canUpgrade,
          checkoutOpen: limits.checkoutOpen,
          cap: limits.caps[meter.id],
        })
      : null;
  if (!(meter && copy && limits)) return <>{fallback}</>;
  return (
    <div className={cn("bg-muted/60 rounded-lg p-4", className)} role="status">
      <LimitCard
        copy={copy}
        meter={meter}
        source="inline_limit"
        usageHref={limits.usageHref}
      />
    </div>
  );
}
