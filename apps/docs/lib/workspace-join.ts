import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { auth } from "@repo/auth/server";
import {
  database as db,
  invitation,
  member,
  organization,
  user,
  workspaceJoinLink,
} from "@repo/database";
import { and, count, eq, gt, ne } from "drizzle-orm";
import { isTeamMember } from "@/app/dashboard/team/_lib/queries";
import { isMissingSchemaError } from "@/lib/community/tables";
import { HttpError } from "@/lib/error-response";
import { logError } from "@/lib/log-error";
import {
  JOINABLE_ROLES,
  strongestRole,
  type WorkspaceRole,
} from "@/lib/permissions";
import { getOwnerPlanForOrganization, getPlanLimits } from "@/lib/plans";
import { PLAN_NAMES } from "@/lib/pricing";

// Workspace join links (Settings → Team). Anyone signed in who opens
// /join/<token> can join as the link's role (never owner) while the plan has
// seats. The token is 32 random bytes; only its SHA-256 is stored, so the
// link is shown once, when it's made or reset. The table comes from
// packages/database/manual-sql/0014_workspace_join_link.sql: until it's
// applied every call here throws JoinLinksUnavailableError (a clear 503),
// never a 500.

/** 32 random bytes, base64url: 43 characters. */
export const JOIN_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function hashJoinToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateJoinToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashJoinToken(token) };
}

export function joinLinkPath(token: string): string {
  return `/join/${token}`;
}

export class JoinLinksUnavailableError extends HttpError {
  constructor() {
    super(
      503,
      "JOIN_LINKS_UNAVAILABLE",
      "Join links aren't set up on this server yet. Invite people by email for now.",
    );
    this.name = "JoinLinksUnavailableError";
  }
}

let reported = false;

/** Runs a query on workspace_join_link; a missing table becomes a clear 503. */
async function guarded<T>(query: () => Promise<T>): Promise<T> {
  try {
    return await query();
  } catch (error) {
    if (isMissingSchemaError(error)) {
      if (!reported) {
        reported = true;
        logError(error as Error, {
          action: "workspaceJoin.missingTable",
          hint: "apply packages/database/manual-sql/0014_workspace_join_link.sql",
        });
      }
      throw new JoinLinksUnavailableError();
    }
    throw error;
  }
}

/** A stored role, never owner (a row can only be written by this module). */
function joinRole(stored: string): WorkspaceRole {
  const role = strongestRole(stored);
  return JOINABLE_ROLES.includes(role) ? role : "member";
}

export interface JoinLinkState {
  role: WorkspaceRole;
  createdAt: Date;
  updatedAt: Date;
  createdByName: string | null;
}

/** The workspace's join link, or null when it's off. */
export async function getJoinLink(
  organizationId: string,
): Promise<JoinLinkState | null> {
  const [row] = await guarded(() =>
    db
      .select({
        role: workspaceJoinLink.role,
        createdAt: workspaceJoinLink.createdAt,
        updatedAt: workspaceJoinLink.updatedAt,
        createdByName: user.name,
      })
      .from(workspaceJoinLink)
      .leftJoin(user, eq(user.id, workspaceJoinLink.createdBy))
      .where(eq(workspaceJoinLink.organizationId, organizationId))
      .limit(1),
  );
  return row ? { ...row, role: joinRole(row.role) } : null;
}

/**
 * Turns the link on with a new token (a reset when it was on: the old link
 * stops working). Returns the token, the only time it exists outside the
 * visitor's browser.
 */
export async function issueJoinLink(input: {
  organizationId: string;
  role: WorkspaceRole;
  createdBy: string;
}): Promise<{ token: string }> {
  if (!JOINABLE_ROLES.includes(input.role)) {
    throw new HttpError(400, "VALIDATION_ERROR", "Pick a role for the link.");
  }
  const { token, hash } = generateJoinToken();
  const now = new Date();
  await guarded(() =>
    db
      .insert(workspaceJoinLink)
      .values({
        organizationId: input.organizationId,
        tokenHash: hash,
        role: input.role,
        createdBy: input.createdBy,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: workspaceJoinLink.organizationId,
        set: {
          tokenHash: hash,
          role: input.role,
          createdBy: input.createdBy,
          createdAt: now,
          updatedAt: now,
        },
      }),
  );
  return { token };
}

/** Changes who the link makes people (the link itself stays the same). */
export async function setJoinLinkRole(
  organizationId: string,
  role: WorkspaceRole,
): Promise<boolean> {
  if (!JOINABLE_ROLES.includes(role)) {
    throw new HttpError(400, "VALIDATION_ERROR", "Pick a role for the link.");
  }
  const rows = await guarded(() =>
    db
      .update(workspaceJoinLink)
      .set({ role, updatedAt: new Date() })
      .where(eq(workspaceJoinLink.organizationId, organizationId))
      .returning({ organizationId: workspaceJoinLink.organizationId }),
  );
  return rows.length > 0;
}

/** Turns the link off: the token is deleted, so the link never works again. */
export async function deleteJoinLink(organizationId: string): Promise<void> {
  await guarded(() =>
    db
      .delete(workspaceJoinLink)
      .where(eq(workspaceJoinLink.organizationId, organizationId)),
  );
}

export interface JoinTarget {
  organizationId: string;
  name: string;
  slug: string;
  logo: string | null;
  role: WorkspaceRole;
}

/** The workspace a token opens, or null for a malformed, reset or off link. */
export async function findJoinTarget(
  token: string,
): Promise<JoinTarget | null> {
  if (!JOIN_TOKEN_PATTERN.test(token)) return null;
  const hash = hashJoinToken(token);
  const [row] = await guarded(() =>
    db
      .select({
        tokenHash: workspaceJoinLink.tokenHash,
        role: workspaceJoinLink.role,
        organizationId: organization.id,
        name: organization.name,
        slug: organization.slug,
        logo: organization.logo,
      })
      .from(workspaceJoinLink)
      .innerJoin(
        organization,
        eq(organization.id, workspaceJoinLink.organizationId),
      )
      .where(eq(workspaceJoinLink.tokenHash, hash))
      .limit(1),
  );
  // The lookup matched on the hash; compare again in constant time.
  if (
    !(row && timingSafeEqual(Buffer.from(row.tokenHash), Buffer.from(hash)))
  ) {
    return null;
  }
  const { tokenHash: _hash, role, ...target } = row;
  return { ...target, role: joinRole(role) };
}

/** 402 LIMIT_REACHED: the plan's teamMembers seats are all taken. */
export function seatsFullError(seats: number): HttpError {
  return new HttpError(
    402,
    "LIMIT_REACHED",
    seats <= 1
      ? `This workspace has no seat for another member yet. Ask an owner to upgrade it to ${PLAN_NAMES.pro} or ${PLAN_NAMES.business}.`
      : `This workspace has used all ${seats} seats. Ask an owner to free one or upgrade it to ${PLAN_NAMES.business}.`,
  );
}

/**
 * Throws LIMIT_REACHED when members plus pending invitations (other than
 * one to the joiner's own address, whose seat is theirs) fill the plan's
 * seats. The same count the invite form uses (actions/organizations.ts);
 * Better Auth checks members again when the member is added.
 */
export async function assertSeatFree(
  organizationId: string,
  email: string,
): Promise<void> {
  const seats = getPlanLimits(
    await getOwnerPlanForOrganization(organizationId),
  ).teamMembers;
  if (!Number.isFinite(seats)) return;
  const [[members], [pending]] = await Promise.all([
    db
      .select({ value: count() })
      .from(member)
      .where(eq(member.organizationId, organizationId)),
    db
      .select({ value: count() })
      .from(invitation)
      .where(
        and(
          eq(invitation.organizationId, organizationId),
          eq(invitation.status, "pending"),
          gt(invitation.expiresAt, new Date()),
          // Invitations store addresses lowercased (inviteMember).
          ne(invitation.email, email.toLowerCase()),
        ),
      ),
  ]);
  if ((members?.value ?? 0) + (pending?.value ?? 0) >= seats) {
    throw seatsFullError(seats);
  }
}

type ErrorWithBody = Error & { body?: { code?: string } };

export type JoinOutcome =
  | { status: "joined"; slug: string; role: WorkspaceRole }
  | { status: "already"; slug: string };

/**
 * Adds the signed-in person to the workspace the token opens, with the
 * link's role. Throws 404 JOIN_LINK_INVALID for a link that doesn't work
 * (any more), LIMIT_REACHED when the seats are taken.
 */
export async function joinWithLink(
  person: { id: string; email: string },
  token: string,
): Promise<JoinOutcome> {
  const target = await findJoinTarget(token);
  if (!target) {
    throw new HttpError(
      404,
      "JOIN_LINK_INVALID",
      "This join link doesn't work anymore. Ask the workspace for a new one.",
    );
  }
  if (await isTeamMember(target.organizationId, person.id)) {
    return { status: "already", slug: target.slug };
  }
  await assertSeatFree(target.organizationId, person.email);

  try {
    // Server-only plugin call (no HTTP route): this module has checked the
    // link; the plugin still enforces the membership limit.
    await auth.api.addMember({
      body: {
        userId: person.id,
        organizationId: target.organizationId,
        role: target.role,
      },
    });
  } catch (error) {
    const code = (error as ErrorWithBody).body?.code;
    if (code === "USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION") {
      return { status: "already", slug: target.slug };
    }
    if (code === "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED") {
      const seats = getPlanLimits(
        await getOwnerPlanForOrganization(target.organizationId),
      ).teamMembers;
      throw seatsFullError(seats);
    }
    throw error;
  }
  return { status: "joined", slug: target.slug, role: target.role };
}
