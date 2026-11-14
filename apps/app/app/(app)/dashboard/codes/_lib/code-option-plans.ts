import "server-only";

import { PLAN_LIMITS, PLANS, type Plan } from "@/lib/plans";
import { type CodeOptionPlans, resolveCodeOptionPlans } from "./code-options";

/** Which plans unlock each code option, for a workspace on `plan`. */
export function codeOptionPlansFor(plan: Plan): CodeOptionPlans {
  return resolveCodeOptionPlans(PLAN_LIMITS, PLANS, plan);
}
