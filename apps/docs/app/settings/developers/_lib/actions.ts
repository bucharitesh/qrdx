"use server";

import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { HttpError } from "@/lib/error-response";
import {
  createOAuthApp,
  deleteOAuthApp,
  type OAuthAppView,
  regenerateOAuthAppSecret,
  setOAuthAppActive,
  updateOAuthApp,
} from "@/lib/oauth-apps/service";
import { oauthAppInputSchema } from "@/lib/oauth-apps/validation";
import { enforceRateLimits } from "@/lib/request-guards";
import { type ActiveScope, getActiveScope } from "@/lib/scope";
import { logError } from "@/lib/shared";
import { UnauthorizedError } from "@/types/errors";

export type OAuthAppActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; upgrade?: boolean };

const mutationLimiter = createRateLimiter({
  limiter: slidingWindow(30, "60 s"),
});
// New apps and new secrets are rare; bursts of either look like abuse.
const createLimiter = createRateLimiter({ limiter: slidingWindow(5, "1 h") });
const secretLimiter = createRateLimiter({ limiter: slidingWindow(5, "1 h") });

const idSchema = z.object({ id: z.string().trim().min(1).max(64) });
const updateSchema = oauthAppInputSchema.extend({
  id: z.string().trim().min(1).max(64),
});
const activeSchema = idSchema.extend({ active: z.boolean() });

function failure(error: unknown, action: string): OAuthAppActionResult<never> {
  if (error instanceof UnauthorizedError) {
    return { ok: false, error: "Sign in to manage OAuth apps." };
  }
  if (error instanceof HttpError) {
    return error.status === 402
      ? { ok: false, error: error.message, upgrade: true }
      : { ok: false, error: error.message };
  }
  logError(error as Error, { action });
  return { ok: false, error: "Something went wrong. Please try again." };
}

function invalid(error: z.ZodError): OAuthAppActionResult<never> {
  return { ok: false, error: error.issues[0]?.message ?? "Invalid input." };
}

async function run<T>(
  action: string,
  limiters: (typeof mutationLimiter)[],
  body: (scope: ActiveScope) => Promise<T>,
  { revalidate = true }: { revalidate?: boolean } = {},
): Promise<OAuthAppActionResult<T>> {
  try {
    const scope = await getActiveScope();
    await enforceRateLimits(
      limiters.map((limiter, index) => ({
        limiter,
        key: `oauth-apps:${action}:${index}:${scope.userId}`,
      })),
    );
    const data = await body(scope);
    if (revalidate) revalidatePath("/settings/developers", "layout");
    return { ok: true, data };
  } catch (error) {
    return failure(error, `oauth-apps.${action}`);
  }
}

export async function createOAuthAppAction(
  input: unknown,
): Promise<OAuthAppActionResult<{ app: OAuthAppView; clientSecret: string }>> {
  const parsed = oauthAppInputSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  // No revalidation: it re-renders /settings/developers/new, which redirects
  // to the list once the plan's app limit is reached, unmounting the dialog
  // that shows the client secret (its only showing). The client navigates to
  // the new app's page itself, and these pages are always rendered fresh.
  return run(
    "create",
    [mutationLimiter, createLimiter],
    (scope) => createOAuthApp(scope, parsed.data),
    { revalidate: false },
  );
}

export async function updateOAuthAppAction(
  input: unknown,
): Promise<OAuthAppActionResult<OAuthAppView>> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { id, ...values } = parsed.data;
  return run("update", [mutationLimiter], (scope) =>
    updateOAuthApp(scope, id, values),
  );
}

export async function setOAuthAppActiveAction(input: {
  id: string;
  active: boolean;
}): Promise<OAuthAppActionResult<{ id: string; active: boolean }>> {
  const parsed = activeSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  return run("active", [mutationLimiter], (scope) =>
    setOAuthAppActive(scope, parsed.data.id, parsed.data.active),
  );
}

/** The new secret is returned once; the old one stops working immediately. */
export async function regenerateOAuthAppSecretAction(input: {
  id: string;
}): Promise<
  OAuthAppActionResult<{ clientSecret: string; secretRotatedAt: Date }>
> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  return run("secret", [mutationLimiter, secretLimiter], (scope) =>
    regenerateOAuthAppSecret(scope, parsed.data.id),
  );
}

export async function deleteOAuthAppAction(input: {
  id: string;
}): Promise<OAuthAppActionResult<{ id: string }>> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  return run("delete", [mutationLimiter], (scope) =>
    deleteOAuthApp(scope, parsed.data.id),
  );
}
