import "server-only";

import { database as db, member, user } from "@repo/database";
import { and, eq, inArray } from "drizzle-orm";
import { isSameCanonicalEmail } from "./rules";

/**
 * Self-referral never earns. It's self-referral when the customer is the
 * affiliate (same account), has the same address once normalised (lower
 * case, no "+tag", Gmail without dots: ./rules.ts canonicalEmail), or is a
 * member of any workspace the affiliate is a member of. Checked when a
 * referral is attributed and again when each commission is created, since
 * people can join a workspace after sign-up.
 */
export async function isSelfReferral(input: {
  affiliateUserId: string;
  customerUserId: string | null;
  /** Other addresses the customer is known by (the Polar customer's). */
  customerEmails?: readonly (string | null | undefined)[];
}): Promise<boolean> {
  const { affiliateUserId, customerUserId } = input;
  if (customerUserId && customerUserId === affiliateUserId) return true;

  const ids = customerUserId
    ? [affiliateUserId, customerUserId]
    : [affiliateUserId];
  const people = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(inArray(user.id, ids));
  const affiliateEmail = people.find(
    (row) => row.id === affiliateUserId,
  )?.email;
  const customerEmail = customerUserId
    ? people.find((row) => row.id === customerUserId)?.email
    : null;
  const emails = [customerEmail, ...(input.customerEmails ?? [])];
  if (
    affiliateEmail &&
    emails.some((email) => isSameCanonicalEmail(affiliateEmail, email))
  ) {
    return true;
  }

  if (!customerUserId) return false;
  const affiliateWorkspaces = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(eq(member.userId, affiliateUserId));
  if (affiliateWorkspaces.length === 0) return false;
  const [shared] = await db
    .select({ id: member.id })
    .from(member)
    .where(
      and(
        eq(member.userId, customerUserId),
        inArray(
          member.organizationId,
          affiliateWorkspaces.map((row) => row.organizationId),
        ),
      ),
    )
    .limit(1);
  return Boolean(shared);
}
