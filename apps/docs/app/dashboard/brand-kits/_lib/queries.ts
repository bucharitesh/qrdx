import "server-only";

import { brandKit, database as db } from "@repo/database";
import { and, asc, count, desc, eq, isNull, sql } from "drizzle-orm";
import type { ActiveScope } from "@/lib/scope";
import {
  type BrandKit,
  type BrandKitSummary,
  parseStoredColors,
  parseStoredStyle,
} from "./brand-kit";

/** Rows owned by a scope: a team's kits, or the user's personal (team-less) kits. */
export function brandKitScopeWhere(
  scope: Pick<ActiveScope, "userId" | "organizationId">,
) {
  return scope.organizationId
    ? eq(brandKit.organizationId, scope.organizationId)
    : and(eq(brandKit.userId, scope.userId), isNull(brandKit.organizationId));
}

type BrandKitRow = typeof brandKit.$inferSelect;

export function toBrandKit(row: BrandKitRow): BrandKit {
  return {
    id: row.id,
    name: row.name,
    logo: row.logo,
    colors: parseStoredColors(row.colors),
    style: parseStoredStyle(row.style),
    isDefault: row.isDefault,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const orderBy = [desc(brandKit.isDefault), asc(brandKit.createdAt)];

export async function listBrandKitsInScope(
  scope: Pick<ActiveScope, "userId" | "organizationId">,
): Promise<BrandKit[]> {
  const rows = await db
    .select()
    .from(brandKit)
    .where(brandKitScopeWhere(scope))
    .orderBy(...orderBy);
  return rows.map(toBrandKit);
}

export async function listBrandKitSummariesInScope(
  scope: Pick<ActiveScope, "userId" | "organizationId">,
): Promise<BrandKitSummary[]> {
  const rows = await db
    .select({
      id: brandKit.id,
      name: brandKit.name,
      colors: brandKit.colors,
      style: brandKit.style,
      isDefault: brandKit.isDefault,
      createdAt: brandKit.createdAt,
      updatedAt: brandKit.updatedAt,
      hasLogo: sql<boolean>`${brandKit.logo} is not null`,
    })
    .from(brandKit)
    .where(brandKitScopeWhere(scope))
    .orderBy(...orderBy);

  return rows.map((row) => ({
    ...row,
    colors: parseStoredColors(row.colors),
    style: parseStoredStyle(row.style),
    hasLogo: Boolean(row.hasLogo),
  }));
}

export async function countBrandKitsInScope(
  scope: Pick<ActiveScope, "userId" | "organizationId">,
): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(brandKit)
    .where(brandKitScopeWhere(scope));
  return row?.value ?? 0;
}

export async function findBrandKitInScope(
  scope: Pick<ActiveScope, "userId" | "organizationId">,
  id: string,
): Promise<BrandKitRow | null> {
  const [row] = await db
    .select()
    .from(brandKit)
    .where(and(eq(brandKit.id, id), brandKitScopeWhere(scope)))
    .limit(1);
  return row ?? null;
}
