import "server-only";

import { env } from "@/env";

/**
 * The abuse limits' defaults. They're public (this file), so a deployment can
 * set its own in the environment (SAFETY_* in env.ts, validated there as
 * whole numbers above 0) without publishing them.
 */
export const SAFETY_LIMIT_DEFAULTS = {
  /** Days an account counts as new (lib/safety/velocity.ts) */
  youngAccountDays: 7,
  /** Dynamic codes a new account can create per rolling hour */
  youngAccountDynamicPerHour: 30,
  /** Destinations one Web Risk recheck pass looks up (lib/safety/recheck.ts) */
  recheckBatch: 500,
} as const;

export interface SafetyLimits {
  youngAccountDays: number;
  youngAccountDynamicPerHour: number;
  recheckBatch: number;
}

type SafetyEnv = Partial<
  Pick<
    typeof env,
    | "SAFETY_YOUNG_ACCOUNT_DAYS"
    | "SAFETY_YOUNG_ACCOUNT_DYNAMIC_PER_HOUR"
    | "SAFETY_RECHECK_BATCH"
  >
>;

/** A validated SAFETY_* value as a number; the default when it's unset. */
function limit(value: string | undefined, fallback: number): number {
  return value ? Number(value) : fallback;
}

/** The environment's limits where set, the defaults elsewhere. */
export function safetyLimits(source: SafetyEnv = env): SafetyLimits {
  return {
    youngAccountDays: limit(
      source.SAFETY_YOUNG_ACCOUNT_DAYS,
      SAFETY_LIMIT_DEFAULTS.youngAccountDays,
    ),
    youngAccountDynamicPerHour: limit(
      source.SAFETY_YOUNG_ACCOUNT_DYNAMIC_PER_HOUR,
      SAFETY_LIMIT_DEFAULTS.youngAccountDynamicPerHour,
    ),
    recheckBatch: limit(
      source.SAFETY_RECHECK_BATCH,
      SAFETY_LIMIT_DEFAULTS.recheckBatch,
    ),
  };
}
