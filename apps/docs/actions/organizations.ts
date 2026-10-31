"use server";

import { auth } from "@repo/auth/server";
import { database as db, organization } from "@repo/database";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { TEAM_SLUG_PATTERN } from "@/app/dashboard/team/_lib/team";
import { getPlan, getPlanLimits } from "@/lib/plans";
import { type ActiveScope, getActiveScope } from "@/lib/scope";
import { logError } from "@/lib/shared";
import { UnauthorizedError } from "@/types/errors";

// Teams are Better Auth organizations. Every write goes through the plugin's
// API (auth.api.*), which re-checks membership and role permissions; these
// actions add input validation, plan gating and rate limits on top.

export type TeamActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string; upgrade?: boolean };

// auth.api calls bypass Better Auth's HTTP rate limiter, so limit here.
const teamLimiter = createRateLimiter({ limiter: slidingWindow(30, "60 s") });
const inviteLimiter = createRateLimiter({
  limiter: slidingWindow(30, "10 m"),
});

const idSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  // Plugin endpoints treat values containing "@" as emails.
  .regex(/^[^@\s]+$/);

const createTeamSchema = z.object({
  name: z.string().trim().min(2, "Team name is too short").max(50),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      new RegExp(TEAM_SLUG_PATTERN),
      "Use 3-48 lowercase letters, numbers and dashes",
    ),
});

const inviteSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .pipe(z.email("Enter a valid email")),
  role: z.enum(["member", "admin"]),
});

const roleSchema = z.object({
  memberId: idSchema,
  role: z.enum(["owner", "admin", "member"]),
});

const memberSchema = z.object({ memberId: idSchema });
const invitationSchema = z.object({ invitationId: idSchema });
const organizationSchema = z.object({ organizationId: idSchema });
const deleteTeamSchema = organizationSchema.extend({
  confirmSlug: z.string().trim().max(64),
});

const ERROR_MESSAGES: Record<string, string> = {
  ORGANIZATION_ALREADY_EXISTS: "That team URL is already taken.",
  YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION:
    "Creating teams requires a Pro plan.",
  USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION:
    "That person is already a member of this team.",
  YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER:
    "A team needs at least one owner. Make someone else an owner first.",
  YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER:
    "A team needs at least one owner. Make someone else an owner first.",
  YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION:
    "This invitation was sent to a different email address.",
  EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION:
    "Verify your email address before responding to this invitation.",
  INVITATION_NOT_FOUND: "This invitation is no longer valid.",
  ORGANIZATION_MEMBERSHIP_LIMIT_REACHED: "This team is full.",
  INVITATION_LIMIT_REACHED: "This team has too many pending invitations.",
};

type ErrorWithBody = Error & {
  statusCode?: number;
  body?: { code?: string; message?: string };
};

function fail(error: string, upgrade?: boolean): TeamActionResult<never> {
  return upgrade ? { ok: false, error, upgrade } : { ok: false, error };
}

/** Surfaces Better Auth API errors (worded for "teams"); hides anything else. */
function failure(error: unknown, action: string): TeamActionResult<never> {
  if (error instanceof UnauthorizedError) {
    return fail("Sign in to manage teams.");
  }
  const apiError = error as ErrorWithBody;
  if (error instanceof Error && typeof apiError.statusCode === "number") {
    const code = apiError.body?.code;
    if (code === "YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION") {
      return fail(ERROR_MESSAGES[code], true);
    }
    const message =
      (code && ERROR_MESSAGES[code]) ||
      (apiError.body?.message ?? apiError.message);
    if (message) {
      return fail(
        message.replace(/organization/gi, (word) =>
          word[0] === "O" ? "Team" : "team",
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

/** The active team, when the caller may manage it (owner or admin). */
function managedTeamId(scope: ActiveScope): string | null {
  return scope.organizationId && scope.role !== "member"
    ? scope.organizationId
    : null;
}

function revalidateTeam() {
  revalidatePath("/dashboard", "layout");
}

export async function createTeam(input: {
  name: string;
  slug: string;
}): Promise<TeamActionResult<{ id: string; slug: string }>> {
  try {
    const scope = await getActiveScope();
    const parsed = createTeamSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid team details.");
    }
    if (!(await allow(teamLimiter, scope, "create"))) return fail(RATE_LIMITED);

    // The plugin's allowUserToCreateOrganization callback enforces this too.
    if (!getPlanLimits(await getPlan(scope.userId)).teams) {
      return fail("Creating teams requires a Pro plan.", true);
    }

    // Creating a team makes it the active workspace.
    const created = (await auth.api.createOrganization({
      headers: await headers(),
      body: { name: parsed.data.name, slug: parsed.data.slug },
    })) as { id: string; slug: string };

    revalidateTeam();
    return { ok: true, data: { id: created.id, slug: created.slug } };
  } catch (error) {
    return failure(error, "createTeam");
  }
}

export async function inviteMember(input: {
  email: string;
  role: "member" | "admin";
}): Promise<
  TeamActionResult<{ id: string; email: string; role: string; expiresAt: Date }>
> {
  try {
    const scope = await getActiveScope();
    const organizationId = managedTeamId(scope);
    if (!organizationId) return fail("Only team owners and admins can invite.");
    const parsed = inviteSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid invitation.");
    }
    if (!(await allow(inviteLimiter, scope, "invite")))
      return fail(RATE_LIMITED);

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

    revalidateTeam();
    return {
      ok: true,
      data: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: new Date(invitation.expiresAt),
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
      return fail("Only team owners and admins can revoke invitations.");
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
  role: "owner" | "admin" | "member";
}): Promise<TeamActionResult> {
  try {
    const scope = await getActiveScope();
    const organizationId = managedTeamId(scope);
    if (!organizationId)
      return fail("Only team owners and admins can change roles.");
    const parsed = roleSchema.safeParse(input);
    if (!parsed.success) return fail("Invalid role.");
    if (parsed.data.role === "owner" && scope.role !== "owner") {
      return fail("Only owners can make someone an owner.");
    }
    if (!(await allow(teamLimiter, scope, "manage"))) return fail(RATE_LIMITED);

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
      return fail("Only team owners and admins can remove members.");
    const parsed = memberSchema.safeParse(input);
    if (!parsed.success) return fail("Invalid member.");
    if (!(await allow(teamLimiter, scope, "manage"))) return fail(RATE_LIMITED);

    // Codes the member created stay with the team (organization_id is kept).
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
    if (!parsed.success) return fail("Invalid team.");
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
    if (!parsed.success) return fail("Invalid team.");
    // Only the team that is open in the dashboard, and only by an owner.
    if (
      scope.organizationId !== parsed.data.organizationId ||
      scope.role !== "owner"
    ) {
      return fail("Only owners can delete a team.");
    }
    const [team] = await db
      .select({ slug: organization.slug })
      .from(organization)
      .where(eq(organization.id, parsed.data.organizationId))
      .limit(1);
    if (!team) return fail("Team not found.");
    if (team.slug !== parsed.data.confirmSlug) {
      return fail("Type the team URL exactly to confirm.");
    }
    if (!(await allow(teamLimiter, scope, "manage"))) return fail(RATE_LIMITED);

    // qr_code / brand_kit / custom_domain rows keep working: their
    // organization_id is set to null, so they return to their creators.
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
}): Promise<TeamActionResult<{ organizationId: string }>> {
  try {
    const scope = await getActiveScope();
    const parsed = invitationSchema.safeParse(input);
    if (!parsed.success) return fail("Invalid invitation.");
    if (!(await allow(teamLimiter, scope, "respond")))
      return fail(RATE_LIMITED);

    // Checks the invitee email, expiry and status; makes the team active.
    const result = (await auth.api.acceptInvitation({
      headers: await headers(),
      body: { invitationId: parsed.data.invitationId },
    })) as { member: { organizationId: string } };

    revalidateTeam();
    return {
      ok: true,
      data: { organizationId: result.member.organizationId },
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
