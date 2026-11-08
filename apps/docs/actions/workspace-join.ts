"use server";

import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { CONFIRMATION_REQUIRED } from "@/lib/account/confirmation";
import { confirmationNeededFor } from "@/lib/account/confirmation-scope";
import { HttpError } from "@/lib/error-response";
import {
  canAssignRole,
  forbiddenMessage,
  JOINABLE_ROLES,
  WORKSPACE_ROLE_LABELS,
  type WorkspaceRole,
} from "@/lib/permissions";
import { getClientIp } from "@/lib/request-guards";
import { getActiveScope } from "@/lib/scope";
import { getCurrentUser, logError } from "@/lib/shared";
import {
  deleteJoinLink,
  getJoinLink,
  issueJoinLink,
  type JoinOutcome,
  joinLinkPath,
  joinWithLink,
  setJoinLinkRole,
} from "@/lib/workspace-join";
import { UnauthorizedError } from "@/types/errors";

// Join links: owners and admins turn the open workspace's link on, reset it,
// change its role or turn it off (Settings → Team); anyone signed in joins
// with one at /join/<token>. lib/workspace-join.ts holds the rules.
//
// A link that adds people as admins is an admin invitation anyone holding it
// can use, so making one (or giving an existing link that role) needs a
// recent "Confirm it's you", like inviting an admin by email
// (actions/organizations.ts). Turning a link off never asks.

export type JoinActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; code: string; error: string };

const manageLimiter = createRateLimiter({
  limiter: slidingWindow(20, "10 m"),
});
// Joining is per person and per address: a token can't be guessed (32
// random bytes), and this keeps anyone from hammering the lookup.
const joinUserLimiter = createRateLimiter({
  limiter: slidingWindow(10, "10 m"),
});
const joinIpLimiter = createRateLimiter({
  limiter: slidingWindow(30, "10 m"),
});

const RATE_LIMITED =
  "Too many requests. Please wait a few minutes and try again.";

const roleSchema = z.enum(
  JOINABLE_ROLES as [WorkspaceRole, ...WorkspaceRole[]],
);
const tokenSchema = z.string().trim().min(1).max(64);

function fail(code: string, error: string): JoinActionResult<never> {
  return { ok: false, code, error };
}

function failure(error: unknown, action: string): JoinActionResult<never> {
  if (error instanceof UnauthorizedError) {
    return fail("UNAUTHORIZED", "Sign in to continue.");
  }
  if (error instanceof HttpError) return fail(error.code, error.message);
  logError(error as Error, { action });
  return fail("UNKNOWN_ERROR", "Something went wrong. Please try again.");
}

/** The open workspace, when the caller may give `role` through a link. */
async function managedScope(role: WorkspaceRole | null) {
  const scope = await getActiveScope();
  const allowed = role
    ? canAssignRole(scope.role, null, role)
    : canAssignRole(scope.role, null, "member");
  if (!allowed) {
    const message =
      role === "billing"
        ? `Only owners can make a link that gives the ${WORKSPACE_ROLE_LABELS.billing} role.`
        : forbiddenMessage(scope.role, "members.manage");
    throw new HttpError(403, "FORBIDDEN", message);
  }
  const { success } = await manageLimiter.limit(`join-link:${scope.userId}`);
  if (!success) throw new HttpError(429, "RATE_LIMITED", RATE_LIMITED);
  return scope;
}

function revalidateTeam() {
  revalidatePath("/dashboard", "layout");
}

/**
 * Null when a link with `role` may be made now, else the CONFIRMATION_REQUIRED
 * result (the client opens "Confirm it's you" and tries again).
 */
async function confirmationForRole(
  scope: { userId: string },
  role: WorkspaceRole,
): Promise<JoinActionResult<never> | null> {
  if (role !== "admin" && role !== "owner") return null;
  return (await confirmationNeededFor(scope))
    ? fail(CONFIRMATION_REQUIRED, CONFIRMATION_REQUIRED)
    : null;
}

/**
 * Turns the link on, or resets it (a new token: the old link stops
 * working). Returns the path, shown once; only its hash is kept.
 */
export async function issueWorkspaceJoinLink(input: {
  role?: WorkspaceRole;
}): Promise<JoinActionResult<{ path: string; role: WorkspaceRole }>> {
  try {
    const requested = roleSchema.safeParse(input?.role ?? "member");
    if (!requested.success) {
      return fail("VALIDATION_ERROR", "Pick a role for the link.");
    }
    const scope = await managedScope(requested.data);
    // A reset keeps the role it had unless another is asked for.
    const current = input?.role
      ? null
      : await getJoinLink(scope.organizationId);
    const role = input?.role ?? current?.role ?? "member";
    if (!canAssignRole(scope.role, null, role)) {
      return fail(
        "FORBIDDEN",
        `Only owners can reset a link that gives the ${WORKSPACE_ROLE_LABELS[role]} role.`,
      );
    }
    const needed = await confirmationForRole(scope, role);
    if (needed) return needed;
    const { token } = await issueJoinLink({
      organizationId: scope.organizationId,
      role,
      createdBy: scope.userId,
    });
    revalidateTeam();
    return { ok: true, data: { path: joinLinkPath(token), role } };
  } catch (error) {
    return failure(error, "issueWorkspaceJoinLink");
  }
}

export async function setWorkspaceJoinLinkRole(input: {
  role: WorkspaceRole;
}): Promise<JoinActionResult> {
  try {
    const parsed = roleSchema.safeParse(input?.role);
    if (!parsed.success) {
      return fail("VALIDATION_ERROR", "Pick a role for the link.");
    }
    const scope = await managedScope(parsed.data);
    const current = await getJoinLink(scope.organizationId);
    if (!current) return fail("NOT_FOUND", "The join link is off.");
    if (!canAssignRole(scope.role, null, current.role)) {
      return fail(
        "FORBIDDEN",
        `Only owners can change a link that gives the ${WORKSPACE_ROLE_LABELS[current.role]} role.`,
      );
    }
    const needed = await confirmationForRole(scope, parsed.data);
    if (needed) return needed;
    await setJoinLinkRole(scope.organizationId, parsed.data);
    revalidateTeam();
    return { ok: true, data: null };
  } catch (error) {
    return failure(error, "setWorkspaceJoinLinkRole");
  }
}

/** Turns the link off: it stops working at once and can't come back. */
export async function disableWorkspaceJoinLink(): Promise<JoinActionResult> {
  try {
    const scope = await managedScope(null);
    await deleteJoinLink(scope.organizationId);
    revalidateTeam();
    return { ok: true, data: null };
  } catch (error) {
    return failure(error, "disableWorkspaceJoinLink");
  }
}

/** /join/<token>: the signed-in person joins with the link's role. */
export async function joinWorkspaceWithLink(input: {
  token: string;
}): Promise<JoinActionResult<JoinOutcome>> {
  try {
    const parsed = tokenSchema.safeParse(input?.token);
    if (!parsed.success) {
      return fail("JOIN_LINK_INVALID", "This join link isn't complete.");
    }
    const user = await getCurrentUser();
    const ip = getClientIp({ headers: await headers() });
    const [byUser, byIp] = await Promise.all([
      joinUserLimiter.limit(`join:user:${user.id}`),
      joinIpLimiter.limit(`join:ip:${ip}`),
    ]);
    if (!(byUser.success && byIp.success)) {
      return fail("RATE_LIMITED", RATE_LIMITED);
    }
    const outcome = await joinWithLink(
      { id: user.id, email: user.email },
      parsed.data,
    );
    if (outcome.status === "joined") revalidateTeam();
    return { ok: true, data: outcome };
  } catch (error) {
    return failure(error, "joinWorkspaceWithLink");
  }
}
