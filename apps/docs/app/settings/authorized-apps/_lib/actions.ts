"use server";

import { auth } from "@repo/auth/server";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { HttpError } from "@/lib/error-response";
import { revokeAuthorizedApp } from "@/lib/oauth-apps/authorized";
import { enforceRateLimits } from "@/lib/request-guards";
import { logError } from "@/lib/shared";

export type RevokeAppResult =
  | { ok: true; revoked: number }
  | { ok: false; error: string };

const revokeLimiter = createRateLimiter({
  limiter: slidingWindow(30, "60 s"),
});

const inputSchema = z.object({ appId: z.string().trim().min(1).max(64) });

/** Settings → Authorized apps → Revoke access, for the signed-in user only. */
export async function revokeAuthorizedAppAction(
  input: unknown,
): Promise<RevokeAppResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid app." };

  try {
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;
    if (!userId) return { ok: false, error: "Sign in to manage app access." };

    await enforceRateLimits([
      { limiter: revokeLimiter, key: `authorized-apps:revoke:${userId}` },
    ]);
    const revoked = await revokeAuthorizedApp(userId, parsed.data.appId);
    revalidatePath("/settings/authorized-apps");
    return { ok: true, revoked };
  } catch (error) {
    if (error instanceof HttpError) return { ok: false, error: error.message };
    logError(error as Error, { action: "authorized-apps.revoke" });
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
