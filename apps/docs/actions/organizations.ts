"use server";

import { isOwnWorkspaceOf } from "@repo/auth/own-workspace-id";
import { auth } from "@repo/auth/server";
import {
  SLUG_FORMAT_MESSAGE,
  WORKSPACE_SLUG_PATTERN,
  workspaceSlugProblem,
} from "@repo/auth/workspace-rules";
import {
  database as db,
  invitation,
  member,
  organization,
} from "@repo/database";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { and, count, eq, gt, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { confirmationNeededFor } from "@/lib/account/confirmation-scope";
import {
  can,
  canAssignRole,
  forbiddenMessage,
  JOINABLE_ROLES,
  strongestRole,
  WORKSPACE_ROLE_LABELS,
  WORKSPACE_ROLES,
  type WorkspaceRole,
} from "@/lib/permissions";
import {
  getOwnerPlanForOrganization,
  getPlan,
  getPlanLimits,
} from "@/lib/plans";
import { PLAN_NAMES } from "@/lib/pricing";
import {
  type ActiveScope,
  getActiveScope,
  getActiveWorkspace,
} from "@/lib/scope";
import { logError } from "@/lib/shared";
import { rememberLastWorkspace, workspaceSlug } from "@/lib/workspaces";
import { UnauthorizedError } from "@/types/errors";

// Workspaces are Better Auth organizations. Every write goes through the
// plugin's API (auth.api.*), which re-checks membership and role
// permissions, and runs QRdx's slug and own-workspace rules
// (packages/auth/workspace-hooks.ts); these actions add input validation,
// plan gating and rate limits on top. The workspace acted on is the one in
// the page's URL (lib/scope.ts).
//
// Deleting a workspace, changing someone's role, removing someone and
// inviting an admin also need a recent "Confirm it's you"
// (lib/account/confirmation.ts), asked once every other check has passed;
// without one they answer CONFIRMATION_REQUIRED and change nothing. The same
// plugin endpoints over HTTP are gated in packages/auth/confirm-gate.ts.

export type TeamActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string; upgrade?: boolean };

// auth.api calls bypass Better Auth's HTTP rate limiter, so limit here.
const teamLimiter = createRateLimiter({ limiter: slidingWindow(30, "60 s") });
const inviteLimiter = createRateLimiter({
  limiter: slidingWindow(30, "10 m"),
});
// The slug check runs as people type (debounced).
const checkLimiter = createRateLimiter({ limiter: slidingWindow(60, "60 s") });

const idSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  // Plugin endpoints treat values containing "@" as emails.
  .regex(/^[^@\s]+$/);

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(new RegExp(WORKSPACE_SLUG_PATTERN), SLUG_FORMAT_MESSAGE)
  .refine((slug) => workspaceSlugProblem(slug) === null, {
    message: "That URL is reserved. Pick another one.",
  });
const nameSchema = z
  .string()
  .trim()
  .min(2, "Workspace name is too short.")
  .max(50, "Workspace name is too long.");

const createWorkspaceSchema = z.object({ name: nameSchema, slug: slugSchema });
const updateWorkspaceSchema = z.object({
  name: nameSchema.optional(),
  slug: slugSchema.optional(),
});

const inviteSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .pipe(z.email("Enter a valid email")),
  role: z.enum(JOINABLE_ROLES as [WorkspaceRole, ...WorkspaceRole[]]),
});

const roleSchema = z.object({
  memberId: idSchema,
  role: z.enum(WORKSPACE_ROLES),
});

const memberSchema = z.object({ memberId: idSchema });
const invitationSchema = z.object({ invitationId: idSchema });
const organizationSchema = z.object({ organizationId: idSchema });
const deleteTeamSchema = organizationSchema.extend({
  confirmSlug: z.string().trim().max(64),
});

const MORE_WORKSPACES = `More workspaces are part of ${PLAN_NAMES.pro} and ${PLAN_NAMES.business}.`;

const ERROR_MESSAGES: Record<string, string> = {
  ORGANIZATION_ALREADY_EXISTS: "That workspace URL is already taken.",
  ORGANIZATION_SLUG_ALREADY_TAKEN: "That workspace URL is already taken.",
  YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION: MORE_WORKSPACES,
  USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION:
    "That person is already a member of this workspace.",
  YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER:
    "A workspace needs at least one owner. Make someone else an owner first.",
  YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER:
    "A workspace needs at least one owner. Make someone else an owner first.",
  YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION:
    "This invitation was sent to a different email address.",
  EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION:
    "Verify your email address before responding to this invitation.",
  INVITATION_NOT_FOUND: "This invitation is no longer valid.",
  ORGANIZATION_MEMBERSHIP_LIMIT_REACHED: `This workspace is full. ${PLAN_NAMES.pro} workspaces have up to ${getPlanLimits("pro").teamMembers} members; ${PLAN_NAMES.business} workspaces have no limit.`,
  INVITATION_LIMIT_REACHED:
    "This workspace has no free seats for another invitation. Revoke a pending invitation or upgrade the workspace's plan.",
};

// Errors the inviter or creator can fix by upgrading (TeamActionResult.upgrade).
const UPGRADE_ERROR_CODES = new Set([
  "YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION",
  "INVITATION_LIMIT_REACHED",
]);

type ErrorWithBody = Error & {
  statusCode?: number;
  body?: { code?: string; message?: string };
};

function fail(error: string, upgrade?: boolean): TeamActionResult<never> {
  return upgrade ? { ok: false, error, upgrade } : { ok: false, error };
}

/** Surfaces Better Auth API errors (worded for workspaces); hides anything else. */
function failure(error: unknown, action: string): TeamActionResult<never> {
  if (error instanceof UnauthorizedError) {
    return fail("Sign in to manage workspaces.");
  }
  const apiError = error as ErrorWithBody;
  if (error instanceof Error && typeof apiError.statusCode === "number") {
    const code = apiError.body?.code;
    if (code && UPGRADE_ERROR_CODES.has(code)) {
      return fail(ERROR_MESSAGES[code], true);
    }
    const message =
      (code && ERROR_MESSAGES[code]) ||
      (apiError.body?.message ?? apiError.message);
    if (message) {
      return fail(
        message.replace(/organization/gi, (word) =>
          word[0] === "O" ? "Workspace" : "workspace",
        ),
      );
    }
  }
  logError(error as Error, { action });
  return fail("Something went wrong. Please try again.");
}

async function allow(
  limiter: typeof teamLimiter,
  scope: Pick<ActiveScope, "userId">,
  bucket: string,
): Promise<boolean> {
  const { success } = await limiter.limit(`teams:${bucket}:${scope.userId}`);
  return success;
}

const RATE_LIMITED = "Too many requests. Please wait a minute and try again.";

/** The open workspace, when the caller may manage its people (lib/permissions). */
function managedTeamId(scope: ActiveScope): string | null {
  return can(scope.role, "members.manage") ? scope.organizationId : null;
}

/** A member of the open workspace, with their strongest role. */
async function findTeamMember(organizationId: string, memberId: string) {
  const [row] = await db
    .select({ id: member.id, role: member.role, userId: member.userId })
    .from(member)
    .where(
      and(eq(member.id, memberId), eq(member.organizationId, organizationId)),
    )
    .limit(1);
  return row ? { ...row, role: strongestRole(row.role) } : null;
}

/** Why `actor` can't give `to` (or change `from`), in the dialog's words. */
function roleChangeError(
  actor: WorkspaceRole,
  from: WorkspaceRole | null,
  to: WorkspaceRole,
): string {
  if (to === "owner" || from === "owner") {
    return "Only owners can make someone an owner, or change an owner's role.";
  }
  if (to === "billing" || from === "billing") {
    return `Only owners can give or take away the ${WORKSPACE_ROLE_LABELS.billing} role, since it decides who pays for the workspace.`;
  }
  return forbiddenMessage(actor, "members.manage");
}

/** Inviting someone as one of these needs "Confirm it's you". */
function isPrivilegedRole(role: WorkspaceRole): boolean {
  return role === "admin" || role === "owner";
}

function revalidateTeam() {
  revalidatePath("/dashboard", "layout");
}

/**
 * Why the team can't take another invitation (members plus pending
 * invitations fill its plan's seats), or null when a seat is free. Better
 * Auth enforces the same cap (packages/auth/server.ts); this explains it.
 */
async function seatLimitError(
  organizationId: string,
  email: string,
): Promise<string | null> {
  const seats = getPlanLimits(
    await getOwnerPlanForOrganization(organizationId),
  ).teamMembers;
  if (!Number.isFinite(seats)) return null;

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
          // Re-inviting a pending email reuses its seat.
          ne(invitation.email, email),
        ),
      ),
  ]);
  if ((members?.value ?? 0) + (pending?.value ?? 0) < seats) return null;

  return seats <= 1
    ? `Adding members needs a workspace owner on ${PLAN_NAMES.pro} or ${PLAN_NAMES.business}.`
    : `This workspace has used all ${seats} seats (members plus pending invitations). Revoke an invitation, or upgrade a workspace owner to ${PLAN_NAMES.business} for unlimited members.`;
}

export async function createWorkspace(input: {
  name: string;
  slug: string;
}): Promise<TeamActionResult<{ id: string; slug: string }>> {
  try {
    const scope = await getActiveScope();
    const parsed = createWorkspaceSchema.safeParse(input);
    if (!parsed.success) {
      return fail(
        parsed.error.issues[0]?.message ?? "Invalid workspace details.",
      );
    }
    if (!(await allow(teamLimiter, scope, "create"))) return fail(RATE_LIMITED);

    // Everyone has their own workspace; more need a paid plan. The plugin's
    // allowUserToCreateOrganization callback enforces this too.
    if (!getPlanLimits(await getPlan(scope.userId)).teams) {
      return fail(MORE_WORKSPACES, true);
    }

    const created = (await auth.api.createOrganization({
      headers: await headers(),
      body: { name: parsed.data.name, slug: parsed.data.slug },
    })) as { id: string; slug: string };

    revalidateTeam();
    return { ok: true, data: { id: created.id, slug: created.slug } };
  } catch (error) {
    return failure(error, "createWorkspace");
  }
}

export type WorkspaceSlugCheck =
  | { status: "available" }
  | { status: "unavailable"; message: string };

/** Whether `slug` is free for a new or renamed workspace (as you type). */
export async function checkWorkspaceSlug(input: {
  slug: string;
}): Promise<TeamActionResult<WorkspaceSlugCheck>> {
  try {
    const scope = await getActiveScope();
    const slug = typeof input?.slug === "string" ? input.slug.trim() : "";
    const problem = workspaceSlugProblem(slug);
    if (problem) {
      return { ok: true, data: { status: "unavailable", message: problem } };
    }
    if (!(await allow(checkLimiter, scope, "check"))) return fail(RATE_LIMITED);
    const [existing] = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.slug, slug))
      .limit(1);
    // The open workspace keeping its own URL counts as available.
    if (existing && existing.id !== scope.organizationId) {
      return {
        ok: true,
        data: {
          status: "unavailable",
          message: "That workspace URL is already taken.",
        },
      };
    }
    return { ok: true, data: { status: "available" } };
  } catch (error) {
    return failure(error, "checkWorkspaceSlug");
  }
}

/**
 * Renames the open workspace and/or changes its URL (owners and admins).
 * Old /dashboard/<old slug> links stop working; printed codes don't change.
 */
export async function updateWorkspace(input: {
  name?: string;
  slug?: string;
}): Promise<TeamActionResult<{ slug: string }>> {
  try {
    const scope = await getActiveScope();
    if (!can(scope.role, "workspace.update")) {
      return fail(forbiddenMessage(scope.role, "workspace.update"));
    }
    const parsed = updateWorkspaceSchema.safeParse(input);
    if (!parsed.success) {
      return fail(
        parsed.error.issues[0]?.message ?? "Invalid workspace details.",
      );
    }
    const data = Object.fromEntries(
      Object.entries(parsed.data).filter(([, value]) => value !== undefined),
    );
    if (Object.keys(data).length === 0) return fail("Nothing to save.");
    if (!(await allow(teamLimiter, scope, "manage"))) return fail(RATE_LIMITED);

    await auth.api.updateOrganization({
      headers: await headers(),
      body: { organizationId: scope.organizationId, data },
    });

    revalidateTeam();
    const slug = await workspaceSlug(scope.organizationId);
    return { ok: true, data: { slug: slug ?? parsed.data.slug ?? "" } };
  } catch (error) {
    return failure(error, "updateWorkspace");
  }
}

/**
 * Called when a workspace page opens: makes it the session's workspace (the
 * playground, ⌘K and pages outside a workspace use it) and remembers it for
 * the next sign-in. Does nothing when it already is.
 */
export async function rememberWorkspace(): Promise<void> {
  try {
    const { scope, sessionWorkspaceId } = await getActiveWorkspace();
    if (sessionWorkspaceId === scope.organizationId) return;
    await auth.api.setActiveOrganization({
      headers: await headers(),
      body: { organizationId: scope.organizationId },
    });
    await rememberLastWorkspace(scope.userId, scope.organizationId);
  } catch (error) {
    if (error instanceof UnauthorizedError) return;
    logError(error as Error, { action: "rememberWorkspace" });
  }
}

export async function inviteMember(input: {
  email: string;
  role: WorkspaceRole;
}): Promise<
  TeamActionResult<{
    id: string;
    email: string;
    role: string;
    expiresAt: Date;
    /** Also emailed to the invitee (false without email setup: share the link) */
    emailed: boolean;
  }>
> {
  try {
    const scope = await getActiveScope();
    const organizationId = managedTeamId(scope);
    if (!organizationId) {
      return fail(forbiddenMessage(scope.role, "members.manage"));
    }
    const parsed = inviteSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid invitation.");
    }
    if (!canAssignRole(scope.role, null, parsed.data.role)) {
      return fail(roleChangeError(scope.role, null, parsed.data.role));
    }
    if (!(await allow(inviteLimiter, scope, "invite")))
      return fail(RATE_LIMITED);
    const seatError = await seatLimitError(organizationId, parsed.data.email);
    if (seatError) return fail(seatError, true);
    if (isPrivilegedRole(parsed.data.role)) {
      const needed = await confirmationNeededFor(scope);
      if (needed) return needed;
    }

    // resend: re-inviting a pending email extends and returns the same invitation.
    const invitation = (await auth.api.createInvitation({
      headers: await headers(),
      body: {
        email: parsed.data.email,
        role: parsed.data.role,
        organizationId,
        resend: true,
      },
    })) as { id: string; email: string; role: string; expiresAt: Date };

    // The copyable invite link keeps working whether or not this is sent.
    const { sendTeamInviteEmail } = await import("@/lib/events/emails");
    const emailed = await sendTeamInviteEmail({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expiresAt: new Date(invitation.expiresAt),
      organizationId,
      inviterId: scope.userId,
    });

    revalidateTeam();
    return {
      ok: true,
      data: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: new Date(invitation.expiresAt),
        emailed,
      },
    };
  } catch (error) {
    return failure(error, "inviteMember");
  }
}

export async function cancelInvitation(input: {
  invitationId: string;
}): Promise<TeamActionResult> {
  try {
    const scope = await getActiveScope();
    if (!managedTeamId(scope))
      return fail(forbiddenMessage(scope.role, "members.manage"));
    const parsed = invitationSchema.safeParse(input);
    if (!parsed.success) return fail("Invalid invitation.");
    if (!(await allow(teamLimiter, scope, "manage"))) return fail(RATE_LIMITED);

    await auth.api.cancelInvitation({
      headers: await headers(),
      body: { invitationId: parsed.data.invitationId },
    });

    revalidateTeam();
    return { ok: true, data: null };
  } catch (error) {
    return failure(error, "cancelInvitation");
  }
}

export async function updateMemberRole(input: {
  memberId: string;
  role: WorkspaceRole;
}): Promise<TeamActionResult> {
  try {
    const scope = await getActiveScope();
    const organizationId = managedTeamId(scope);
    if (!organizationId)
      return fail(forbiddenMessage(scope.role, "members.manage"));
    const parsed = roleSchema.safeParse(input);
    if (!parsed.success) return fail("Invalid role.");
    if (!(await allow(teamLimiter, scope, "manage"))) return fail(RATE_LIMITED);
    const target = await findTeamMember(organizationId, parsed.data.memberId);
    if (!target) return fail("That person isn't a member of this workspace.");
    if (!canAssignRole(scope.role, target.role, parsed.data.role)) {
      return fail(roleChangeError(scope.role, target.role, parsed.data.role));
    }
    const needed = await confirmationNeededFor(scope);
    if (needed) return needed;

    await auth.api.updateMemberRole({
      headers: await headers(),
      body: {
        memberId: parsed.data.memberId,
        role: parsed.data.role,
        organizationId,
      },
    });

    revalidateTeam();
    return { ok: true, data: null };
  } catch (error) {
    return failure(error, "updateMemberRole");
  }
}

export async function removeMember(input: {
  memberId: string;
}): Promise<TeamActionResult> {
  try {
    const scope = await getActiveScope();
    const organizationId = managedTeamId(scope);
    if (!organizationId)
      return fail(forbiddenMessage(scope.role, "members.manage"));
    const parsed = memberSchema.safeParse(input);
    if (!parsed.success) return fail("Invalid member.");
    if (!(await allow(teamLimiter, scope, "manage"))) return fail(RATE_LIMITED);
    // Owners and billing members decide who pays: only owners remove them.
    const target = await findTeamMember(organizationId, parsed.data.memberId);
    if (
      target &&
      (target.role === "owner" || target.role === "billing") &&
      !can(scope.role, "owners.manage")
    ) {
      return fail(
        target.role === "owner"
          ? "Only owners can remove an owner from the workspace."
          : "Only owners can remove a billing member from the workspace.",
      );
    }

    const needed = await confirmationNeededFor(scope);
    if (needed) return needed;

    // Codes the member created stay with the workspace (organization_id is kept).
    await auth.api.removeMember({
      headers: await headers(),
      body: { memberIdOrEmail: parsed.data.memberId, organizationId },
    });

    revalidateTeam();
    return { ok: true, data: null };
  } catch (error) {
    return failure(error, "removeMember");
  }
}

export async function leaveTeam(input: {
  organizationId: string;
}): Promise<TeamActionResult> {
  try {
    const scope = await getActiveScope();
    const parsed = organizationSchema.safeParse(input);
    if (!parsed.success) return fail("Invalid workspace.");
    if (isOwnWorkspaceOf(parsed.data.organizationId, scope.userId)) {
      return fail("You can't leave your own workspace.");
    }
    if (!(await allow(teamLimiter, scope, "manage"))) return fail(RATE_LIMITED);

    await auth.api.leaveOrganization({
      headers: await headers(),
      body: { organizationId: parsed.data.organizationId },
    });

    revalidateTeam();
    return { ok: true, data: null };
  } catch (error) {
    return failure(error, "leaveTeam");
  }
}

export async function deleteTeam(input: {
  organizationId: string;
  confirmSlug: string;
}): Promise<TeamActionResult> {
  try {
    const scope = await getActiveScope();
    const parsed = deleteTeamSchema.safeParse(input);
    if (!parsed.success) return fail("Invalid workspace.");
    // Only the workspace that is open in the dashboard, and only by an owner.
    if (
      scope.organizationId !== parsed.data.organizationId ||
      !can(scope.role, "workspace.delete")
    ) {
      return fail("Only owners can delete a workspace.");
    }
    if (isOwnWorkspaceOf(parsed.data.organizationId, scope.userId)) {
      return fail("Your own workspace can't be deleted. Rename it instead.");
    }
    const [team] = await db
      .select({ slug: organization.slug })
      .from(organization)
      .where(eq(organization.id, parsed.data.organizationId))
      .limit(1);
    if (!team) return fail("Workspace not found.");
    if (team.slug !== parsed.data.confirmSlug) {
      return fail("Type the workspace URL exactly to confirm.");
    }
    if (!(await allow(teamLimiter, scope, "manage"))) return fail(RATE_LIMITED);
    const needed = await confirmationNeededFor(scope);
    if (needed) return needed;

    // Every row goes to the own workspace of the member who created it
    // (packages/auth/workspace-hooks.ts), so codes keep working.
    await auth.api.deleteOrganization({
      headers: await headers(),
      body: { organizationId: parsed.data.organizationId },
    });

    revalidateTeam();
    return { ok: true, data: null };
  } catch (error) {
    return failure(error, "deleteTeam");
  }
}

export async function acceptInvitation(input: {
  invitationId: string;
}): Promise<TeamActionResult<{ organizationId: string; slug: string | null }>> {
  try {
    const scope = await getActiveScope();
    const parsed = invitationSchema.safeParse(input);
    if (!parsed.success) return fail("Invalid invitation.");
    if (!(await allow(teamLimiter, scope, "respond")))
      return fail(RATE_LIMITED);

    // Checks the invitee email, expiry and status; makes the workspace active.
    const result = (await auth.api.acceptInvitation({
      headers: await headers(),
      body: { invitationId: parsed.data.invitationId },
    })) as { member: { organizationId: string } };

    revalidateTeam();
    return {
      ok: true,
      data: {
        organizationId: result.member.organizationId,
        slug: await workspaceSlug(result.member.organizationId),
      },
    };
  } catch (error) {
    return failure(error, "acceptInvitation");
  }
}

export async function rejectInvitation(input: {
  invitationId: string;
}): Promise<TeamActionResult> {
  try {
    const scope = await getActiveScope();
    const parsed = invitationSchema.safeParse(input);
    if (!parsed.success) return fail("Invalid invitation.");
    if (!(await allow(teamLimiter, scope, "respond")))
      return fail(RATE_LIMITED);

    await auth.api.rejectInvitation({
      headers: await headers(),
      body: { invitationId: parsed.data.invitationId },
    });

    revalidateTeam();
    return { ok: true, data: null };
  } catch (error) {
    return failure(error, "rejectInvitation");
  }
}
