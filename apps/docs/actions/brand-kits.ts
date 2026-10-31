"use server";

import { brandKit, database as db } from "@repo/database";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import cuid from "cuid";
import { and, eq, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  type BrandKit,
  type BrandKitInput,
  type BrandKitSummary,
  brandKitInputSchema,
} from "@/app/dashboard/brand-kits/_lib/brand-kit";
import {
  brandKitScopeWhere,
  countBrandKitsInScope,
  findBrandKitInScope,
  listBrandKitSummariesInScope,
  toBrandKit,
} from "@/app/dashboard/brand-kits/_lib/queries";
import { getPlanForScope, getPlanLimits } from "@/lib/plans";
import { type ActiveScope, getActiveScope } from "@/lib/scope";
import { logError } from "@/lib/shared";
import { UnauthorizedError } from "@/types/errors";

export type BrandKitActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; upgrade?: boolean };

const mutationLimiter = createRateLimiter({
  limiter: slidingWindow(30, "60 s"),
});

const idSchema = z.string().trim().min(1).max(64);
const updateSchema = brandKitInputSchema.extend({ id: idSchema });

function fail(
  error: string,
  upgrade?: boolean,
): { ok: false; error: string; upgrade?: boolean } {
  return upgrade ? { ok: false, error, upgrade } : { ok: false, error };
}

function failure(error: unknown, action: string) {
  if (error instanceof UnauthorizedError) {
    return fail("Sign in to manage brand kits.");
  }
  logError(error as Error, { action });
  return fail("Something went wrong. Please try again.");
}

async function checkRateLimit(scope: ActiveScope): Promise<boolean> {
  const { success } = await mutationLimiter.limit(`brand-kits:${scope.userId}`);
  return success;
}

/** Makes `id` the only default kit in its scope, in one statement. */
async function setOnlyDefault(scope: ActiveScope, id: string) {
  await db
    .update(brandKit)
    .set({ isDefault: sql<boolean>`(${brandKit.id} = ${id})` })
    .where(
      and(
        brandKitScopeWhere(scope),
        or(eq(brandKit.id, id), eq(brandKit.isDefault, true)),
      ),
    );
}

function revalidate() {
  revalidatePath("/dashboard/brand-kits");
}

/** Kits in the active scope, without logos (for menus). Empty when signed out. */
export async function listBrandKits(): Promise<BrandKitSummary[]> {
  try {
    const scope = await getActiveScope();
    return await listBrandKitSummariesInScope(scope);
  } catch (error) {
    if (error instanceof UnauthorizedError) return [];
    logError(error as Error, { action: "listBrandKits" });
    throw error;
  }
}

export async function getBrandKit(
  id: string,
): Promise<BrandKitActionResult<BrandKit>> {
  try {
    const parsedId = idSchema.safeParse(id);
    if (!parsedId.success) return fail("Brand kit not found.");
    const scope = await getActiveScope();
    const row = await findBrandKitInScope(scope, parsedId.data);
    if (!row) return fail("Brand kit not found.");
    return { ok: true, data: toBrandKit(row) };
  } catch (error) {
    return failure(error, "getBrandKit");
  }
}

export async function createBrandKit(
  input: BrandKitInput,
): Promise<BrandKitActionResult<{ id: string }>> {
  try {
    const scope = await getActiveScope();
    const parsed = brandKitInputSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid brand kit.");
    }
    if (!(await checkRateLimit(scope))) {
      return fail("Too many changes. Please wait a minute and try again.");
    }

    const limit = getPlanLimits(await getPlanForScope(scope)).brandKits;
    const kits = `${limit} brand kit${limit === 1 ? "" : "s"}`;
    // Team limits follow the owners' plan, so only offer an upgrade for personal kits.
    const upgrade = !scope.organizationId;
    const limitMessage = upgrade
      ? `The Free plan includes ${kits}. Upgrade to Pro for unlimited brand kits.`
      : `This team's plan includes ${kits}. A team owner on Pro removes the limit.`;
    const existing = await countBrandKitsInScope(scope);
    if (existing >= limit) {
      return fail(limitMessage, upgrade);
    }

    const { name, logo, colors, style, isDefault } = parsed.data;
    const id = cuid();
    await db.insert(brandKit).values({
      id,
      userId: scope.userId,
      organizationId: scope.organizationId,
      name,
      logo,
      colors,
      style,
      isDefault: false,
    });

    // Concurrent creates can both pass the check above; keep only what the plan allows.
    if ((await countBrandKitsInScope(scope)) > limit) {
      await db.delete(brandKit).where(eq(brandKit.id, id));
      return fail(limitMessage, upgrade);
    }

    if (isDefault || existing === 0) {
      await setOnlyDefault(scope, id);
    }

    revalidate();
    return { ok: true, data: { id } };
  } catch (error) {
    return failure(error, "createBrandKit");
  }
}

/** Editing is always allowed, even over the plan limit (e.g. after a downgrade). */
export async function updateBrandKit(
  input: BrandKitInput & { id: string },
): Promise<BrandKitActionResult<{ id: string }>> {
  try {
    const scope = await getActiveScope();
    const parsed = updateSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid brand kit.");
    }
    if (!(await checkRateLimit(scope))) {
      return fail("Too many changes. Please wait a minute and try again.");
    }

    const { id, name, logo, colors, style, isDefault } = parsed.data;
    const updated = await db
      .update(brandKit)
      .set({ name, logo, colors, style })
      .where(and(eq(brandKit.id, id), brandKitScopeWhere(scope)))
      .returning({ id: brandKit.id, isDefault: brandKit.isDefault });

    if (updated.length === 0) return fail("Brand kit not found.");

    if (isDefault && !updated[0].isDefault) {
      await setOnlyDefault(scope, id);
    } else if (!isDefault && updated[0].isDefault) {
      await db
        .update(brandKit)
        .set({ isDefault: false })
        .where(and(eq(brandKit.id, id), brandKitScopeWhere(scope)));
    }

    revalidate();
    return { ok: true, data: { id } };
  } catch (error) {
    return failure(error, "updateBrandKit");
  }
}

export async function setDefaultBrandKit(
  id: string,
): Promise<BrandKitActionResult<{ id: string }>> {
  try {
    const scope = await getActiveScope();
    const parsedId = idSchema.safeParse(id);
    if (!parsedId.success) return fail("Brand kit not found.");
    if (!(await checkRateLimit(scope))) {
      return fail("Too many changes. Please wait a minute and try again.");
    }

    const row = await findBrandKitInScope(scope, parsedId.data);
    if (!row) return fail("Brand kit not found.");
    await setOnlyDefault(scope, row.id);

    revalidate();
    return { ok: true, data: { id: row.id } };
  } catch (error) {
    return failure(error, "setDefaultBrandKit");
  }
}

export async function deleteBrandKit(
  id: string,
): Promise<BrandKitActionResult<{ id: string }>> {
  try {
    const scope = await getActiveScope();
    const parsedId = idSchema.safeParse(id);
    if (!parsedId.success) return fail("Brand kit not found.");
    if (!(await checkRateLimit(scope))) {
      return fail("Too many changes. Please wait a minute and try again.");
    }

    const deleted = await db
      .delete(brandKit)
      .where(and(eq(brandKit.id, parsedId.data), brandKitScopeWhere(scope)))
      .returning({ id: brandKit.id });
    if (deleted.length === 0) return fail("Brand kit not found.");

    revalidate();
    return { ok: true, data: { id: parsedId.data } };
  } catch (error) {
    return failure(error, "deleteBrandKit");
  }
}
