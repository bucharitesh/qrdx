"use server";

import {
  getCodeLifecycle,
  type LifecycleActionResult,
} from "@/actions/code-lifecycle";
import {
  type CodeMarketingSettings,
  getCodeMarketing,
  type MarketingActionResult,
} from "@/actions/code-marketing";
import { getPlanForScope } from "@/lib/plans";
import { getActiveScope } from "@/lib/scope";
import { logError } from "@/lib/shared";
import { UnauthorizedError } from "@/types/errors";
import { codeOptionPlansFor } from "./code-option-plans";
import type { CodeOptionPlans } from "./code-options";

export interface CodeOptionsData {
  plans: CodeOptionPlans;
  /** The code's routing, UTM and pixel settings; null without a code */
  marketing: MarketingActionResult<CodeMarketingSettings> | null;
  /** The code's password, dates and limits; null without a code */
  lifecycle: LifecycleActionResult | null;
}

export type CodeOptionsResult =
  | { success: true; data: CodeOptionsData }
  | { success: false; error: { message: string } };

/**
 * Everything the builder's option buttons need in one round trip: the plans
 * that unlock each option for the active workspace and, for an existing
 * code, its current settings (from the same actions its panels save with).
 */
export async function getCodeOptions(
  codeId: string | null,
): Promise<CodeOptionsResult> {
  try {
    const scope = await getActiveScope();
    const [plan, marketing, lifecycle] = await Promise.all([
      getPlanForScope(scope),
      codeId ? getCodeMarketing(codeId) : null,
      codeId ? getCodeLifecycle(codeId) : null,
    ]);
    return {
      success: true,
      data: { plans: codeOptionPlansFor(plan), marketing, lifecycle },
    };
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return {
        success: false,
        error: { message: "Sign in again to see the options." },
      };
    }
    logError(error as Error, { action: "getCodeOptions" });
    return {
      success: false,
      error: { message: "Couldn't load the options. Try again." },
    };
  }
}
