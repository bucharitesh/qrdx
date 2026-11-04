// Which card a LIMIT_REACHED answer gets. Pure, so the decisions are tested
// without a browser.

import {
  type Meter,
  type MeterId,
  meterLabel,
} from "@/app/settings/usage/_lib/meters";
import type { ShellLimits } from "./plan-limits-provider";

export interface LimitRequest {
  meterId: MeterId;
  /** The count now, when the caller knows it; else it's at the cap */
  used?: number;
}

/**
 * The meter a LIMIT_REACHED answer is about, on the workspace's plan. Null
 * when the plan has no cap for it here (unlimited, or not on the plan: a
 * plan badge's job), so no card claims a limit that doesn't exist.
 */
export function limitRequestMeter(
  request: LimitRequest,
  limits: Pick<ShellLimits, "caps" | "isTeam">,
): Meter | null {
  const limit = limits.caps[request.meterId]?.limit;
  if (limit === null || limit === undefined || limit <= 0) return null;
  return {
    id: request.meterId,
    label: meterLabel(request.meterId, { isTeam: limits.isTeam }),
    used: Math.max(request.used ?? limit, limit),
    limit,
    unit: request.meterId === "storage" ? "bytes" : "count",
  };
}

/**
 * What a LIMIT_REACHED answer shows: the limit card when the app shell can
 * show one for a cap this plan has; inside the shell otherwise, the
 * server's message alone (a fixed cap no plan lifts); outside the shell,
 * the upgrade dialog (the playground and the site have no plan context).
 */
export function limitResponse(
  request: LimitRequest,
  {
    hosted,
    limits,
  }: {
    hosted: boolean;
    limits: Pick<ShellLimits, "caps" | "isTeam"> | null;
  },
): "card" | "message" | "upgrade-dialog" {
  if (!limits) return "upgrade-dialog";
  return hosted && limitRequestMeter(request, limits) ? "card" : "message";
}
