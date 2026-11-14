import "server-only";

import { database as db, qrCode } from "@repo/database";
import { and, eq, inArray, or, type SQL } from "drizzle-orm";
import {
  generateSlug,
  SHARED_SLUG_SCOPE,
  slugProblem,
} from "@/lib/short-links";

// Where a slug resolves and who may claim it (see SHARED_SLUG_SCOPE).
// Uniqueness is enforced by two indexes (manual-sql/0009):
//   (slug_scope, slug): a namespace holds each slug once;
//   (domain_id, slug):  a custom domain serves each slug once, whichever
//                       namespace it came from.

/**
 * The code a short link resolves to: on a custom domain (proxy.ts sets its id)
 * the domain's code with that slug, anywhere else the shared namespace's.
 */
export function slugWhere(slug: string, customDomainId: string | null): SQL {
  return customDomainId
    ? (and(eq(qrCode.domainId, customDomainId), eq(qrCode.slug, slug)) as SQL)
    : (and(
        eq(qrCode.slugScope, SHARED_SLUG_SCOPE),
        eq(qrCode.slug, slug),
      ) as SQL);
}

/** The namespace a back-half chosen for a code on `domainId` belongs to. */
export const scopeForDomain = (domainId: string | null): string =>
  domainId ?? SHARED_SLUG_SCOPE;

/** Rows that hold `slugs` where a code on `domainId` (null = default link) would need them. */
function claimedWhere(slugs: string[], domainId: string | null): SQL {
  return domainId
    ? (and(
        inArray(qrCode.slug, slugs),
        or(eq(qrCode.domainId, domainId), eq(qrCode.slugScope, domainId)),
      ) as SQL)
    : (and(
        inArray(qrCode.slug, slugs),
        eq(qrCode.slugScope, SHARED_SLUG_SCOPE),
      ) as SQL);
}

/** Which of `slugs` are taken for a code on `domainId` (null = the shared namespace). */
export async function findTakenSlugs(
  slugs: string[],
  domainId: string | null,
  { exceptCodeId }: { exceptCodeId?: string } = {},
): Promise<Set<string>> {
  const taken = new Set<string>();
  const unique = [...new Set(slugs)];
  for (let i = 0; i < unique.length; i += 500) {
    const rows = await db
      .select({ id: qrCode.id, slug: qrCode.slug })
      .from(qrCode)
      .where(claimedWhere(unique.slice(i, i + 500), domainId));
    for (const row of rows) {
      if (row.id !== exceptCodeId) taken.add(row.slug);
    }
  }
  return taken;
}

/** A Postgres unique violation (23505), also when drizzle wraps it. */
export function isUniqueViolation(error: unknown): boolean {
  for (let e = error, depth = 0; e && depth < 4; depth++) {
    if (typeof e !== "object") return false;
    const { code, message, cause } = e as {
      code?: unknown;
      message?: unknown;
      cause?: unknown;
    };
    if (code === "23505") return true;
    if (typeof message === "string" && /duplicate key value/i.test(message)) {
      return true;
    }
    e = cause;
  }
  return false;
}

/**
 * Before a custom domain is deleted: its codes' back-halves move to the shared
 * namespace when they're free and allowed there, else the code gets a new
 * generated slug. Codes printed with the domain's links stop working either
 * way (the domain is gone); this keeps every code reachable at qrdx.dev/q/.
 * Returns how many codes got a new slug.
 */
export async function releaseDomainSlugs(domainId: string): Promise<number> {
  const rows = await db
    .select({ id: qrCode.id, slug: qrCode.slug })
    .from(qrCode)
    .where(eq(qrCode.slugScope, domainId));
  let renamed = 0;
  for (const row of rows) {
    const where = and(eq(qrCode.id, row.id), eq(qrCode.slugScope, domainId));
    if (!slugProblem(row.slug, { onCustomDomain: false })) {
      try {
        await db
          .update(qrCode)
          .set({ slugScope: SHARED_SLUG_SCOPE, domainId: null })
          .where(where);
        continue;
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
    for (let attempt = 0; ; attempt++) {
      try {
        await db
          .update(qrCode)
          .set({
            slug: generateSlug(),
            slugScope: SHARED_SLUG_SCOPE,
            domainId: null,
          })
          .where(where);
        renamed += 1;
        break;
      } catch (error) {
        if (!isUniqueViolation(error) || attempt >= 4) throw error;
      }
    }
  }
  return renamed;
}
