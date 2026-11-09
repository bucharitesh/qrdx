"use server";

import { auth } from "@repo/auth/server";
import { twoFactorOnFor } from "@repo/auth/workspace-two-factor";
import {
  twoFactorRequiredIn,
  withTwoFactorRequired,
} from "@repo/auth/workspace-two-factor-rules";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { auditTwoFactorRequirement } from "@/ee/audit-log/security-events";
import { confirmationNeededFor } from "@/lib/account/confirmation-scope";
import { HttpError } from "@/lib/error-response";
import { can, forbiddenMessage } from "@/lib/permissions";
import { getOwnerPlanForOrganization, getPlanLimits } from "@/lib/plans";
import { getActiveScope } from "@/lib/scope";
import { logError } from "@/lib/shared";
import { UnauthorizedError } from "@/types/errors";
import {
  OWN_TWO_FACTOR_FIRST,
  requirementPlanName,
  workspaceMetadataOf,
} from "./two-factor-requirement";

// Settings → Team → "Require two-step verification" for the open workspace.
// Owners and admins only, on Business, and turning it on needs two-step
// verification on yourself (you'd shut yourself out otherwise). Either way it
// asks "Confirm it's you" once every other check has passed. Nobody is
// emailed: members are told when they next open the workspace.
//
// The setting lives in the workspace's metadata, written through Better
// Auth's API (which checks the role again). The same endpoint over HTTP
// can't change metadata (packages/auth/workspace-two-factor.ts).

export type TwoFactorRequirementResult =
  | { ok: true; data: { required: boolean } }
  | { ok: false; error: string; upgrade?: boolean };

const limiter = createRateLimiter({
  prefix: "qrdx:require-two-factor",
  limiter: slidingWindow(20, "60 s"),
});

const inputSchema = z.object({ required: z.boolean() });

const fail = (error: string, upgrade?: boolean): TwoFactorRequirementResult =>
  upgrade ? { ok: false, error, upgrade } : { ok: false, error };

export async function setTwoFactorRequirement(
  input: unknown,
): Promise<TwoFactorRequirementResult> {
  try {
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) return fail("Invalid request.");
    const { required } = parsed.data;

    // The workspace in the page's URL; refused for someone it shuts out.
    const scope = await getActiveScope();
    if (!can(scope.role, "workspace.update")) {
      return fail(forbiddenMessage(scope.role, "workspace.update"));
    }
    const { success } = await limiter.limit(scope.userId);
    if (!success) {
      return fail("Too many requests. Please wait a minute and try again.");
    }
    if (required) {
      const plan = await getOwnerPlanForOrganization(scope.organizationId);
      if (!getPlanLimits(plan).requireTwoFactor) {
        return fail(
          `Requiring two-step verification comes with ${requirementPlanName()}.`,
          true,
        );
      }
      if (!(await twoFactorOnFor(scope.userId))) {
        return fail(OWN_TWO_FACTOR_FIRST);
      }
    }
    const needed = await confirmationNeededFor(scope);
    if (needed) return needed;

    const metadata = await workspaceMetadataOf(scope.organizationId);
    await auth.api.updateOrganization({
      headers: await headers(),
      body: {
        organizationId: scope.organizationId,
        data: { metadata: withTwoFactorRequired(metadata, required) },
      },
    });
    auditTwoFactorRequirement(scope, twoFactorRequiredIn(metadata), required);
    revalidatePath("/dashboard", "layout");
    return { ok: true, data: { required } };
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return fail("Sign in to change this workspace's settings.");
    }
    if (error instanceof HttpError) return fail(error.message);
    logError(error as Error, { action: "setTwoFactorRequirement" });
    return fail("Something went wrong. Please try again.");
  }
}
