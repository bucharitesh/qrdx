import { user } from "@repo/database";
import { eq, isNull, lt, or, type SQL } from "drizzle-orm";

/**
 * The author isn't banned: never banned, unbanned, or the ban has run out
 * (Better Auth lifts an expired ban at the next sign-in). Every community
 * query joins the author's `user` row and adds this, so a banned account's
 * items disappear from the gallery, profiles, item pages and tag counts.
 */
export function authorNotBanned(now: Date = new Date()): SQL {
  return or(
    isNull(user.banned),
    eq(user.banned, false),
    lt(user.banExpires, now),
  ) as SQL;
}
