import "server-only";

import {
  ownWorkspaceId,
  ownWorkspaceMemberId,
} from "@repo/auth/own-workspace-id";
import {
  nextFreeSlug,
  ownWorkspaceName,
  ownWorkspaceSlugBase,
} from "@repo/auth/workspace-rules";
import {
  apiKey,
  brandKit,
  customDomain,
  database as db,
  fileAsset,
  folder,
  landingPage,
  member,
  notificationSetting,
  oauthApp,
  organization,
  qrCode,
  qrPreset,
  tag,
  user as userTable,
  webhookEndpoint,
} from "@repo/database";
import { and, asc, eq, isNull, like, or, sql } from "drizzle-orm";
import { HttpError } from "@/lib/error-response";
import { logError } from "@/lib/log-error";
import { isUniqueViolation } from "@/lib/slug-claims";

// Every signed-in person works in a workspace (a Better Auth organization).
// Each person has one of their own, made at sign-up (packages/auth/server.ts)
// or, for accounts from before workspaces, here on their first visit, when
// the rows they had without a workspace move into it. The backfill
// (packages/database/scripts/backfill-workspaces.mjs) does the same for every
// account at once; this code is correct whether or not it has run.

export type WorkspaceRole = "owner" | "admin" | "member";

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  /** The viewer's role (the strongest of several) */
  role: WorkspaceRole;
  /** The viewer's own workspace (can't be left or deleted) */
  own: boolean;
}

export interface WorkspaceUser {
  id: string;
  name?: string | null;
  email: string;
}

/** A workspace that doesn't exist or that the viewer isn't a member of. */
export class WorkspaceNotFoundError extends HttpError {
  constructor() {
    super(404, "WORKSPACE_NOT_FOUND", "Workspace not found.");
    this.name = "WorkspaceNotFoundError";
  }
}

export function strongestRole(role: string): WorkspaceRole {
  const roles = role.split(",").map((r) => r.trim());
  if (roles.includes("owner")) return "owner";
  return roles.includes("admin") ? "admin" : "member";
}

const workspaceColumns = {
  id: organization.id,
  name: organization.name,
  slug: organization.slug,
  logo: organization.logo,
  role: member.role,
  joinedAt: member.createdAt,
};

type WorkspaceRow = {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  role: string;
};

const toWorkspace = (userId: string, row: WorkspaceRow): Workspace => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  logo: row.logo,
  role: strongestRole(row.role),
  own: row.id === ownWorkspaceId(userId),
});

/** The user's workspaces: their own first, then by name. */
export async function listWorkspaces(userId: string): Promise<Workspace[]> {
  const rows = await db
    .select(workspaceColumns)
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, userId))
    .orderBy(asc(organization.name));
  return rows
    .map((row) => toWorkspace(userId, row))
    .sort((a, b) => Number(b.own) - Number(a.own));
}

/** The workspace at /dashboard/<slug>, if the user is a member. */
export async function findWorkspaceBySlug(
  userId: string,
  slug: string,
): Promise<Workspace | null> {
  const [row] = await db
    .select(workspaceColumns)
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(and(eq(member.userId, userId), eq(organization.slug, slug)))
    .limit(1);
  return row ? toWorkspace(userId, row) : null;
}

export async function findWorkspaceById(
  userId: string,
  organizationId: string,
): Promise<Workspace | null> {
  const [row] = await db
    .select(workspaceColumns)
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(and(eq(member.userId, userId), eq(organization.id, organizationId)))
    .limit(1);
  return row ? toWorkspace(userId, row) : null;
}

/** The slug of any workspace (for links in emails), or null. */
export async function workspaceSlug(
  organizationId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ slug: organization.slug })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);
  return row?.slug ?? null;
}

// ─── Your own workspace ──────────────────────────────────────────────────────

/**
 * Tables whose rows belonged to "no workspace" (organization_id null) before
 * workspaces: they move into their creator's own workspace. The backfill
 * script lists the same tables.
 */
const ADOPTED_TABLES = [
  qrCode,
  landingPage,
  customDomain,
  qrPreset,
  brandKit,
  fileAsset,
  folder,
  tag,
  webhookEndpoint,
  notificationSetting,
  apiKey,
] as const;

async function takenSlugs(base: string): Promise<Set<string>> {
  const rows = await db
    .select({ slug: organization.slug })
    .from(organization)
    .where(
      or(eq(organization.slug, base), like(organization.slug, `${base}-%`)),
    );
  return new Set(rows.map((row) => row.slug));
}

/**
 * The user's own workspace, created on the spot when it doesn't exist yet,
 * together with moving their rows that have no workspace into it (one
 * batch, so it is all or nothing). Idempotent: the ids are derived from the
 * user id, so concurrent first visits write the same rows once.
 */
export async function ensureOwnWorkspace(
  person: WorkspaceUser,
): Promise<Workspace> {
  const id = ownWorkspaceId(person.id);
  const existing = await findWorkspaceById(person.id, id);
  if (existing) return existing;

  const base = ownWorkspaceSlugBase(person);
  let taken = await takenSlugs(base);
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = nextFreeSlug(base, taken);
    const now = new Date();
    try {
      await db.batch([
        db
          .insert(organization)
          .values({
            id,
            name: ownWorkspaceName(person),
            slug,
            createdAt: now,
          })
          .onConflictDoNothing({ target: organization.id }),
        db
          .insert(member)
          .values({
            id: ownWorkspaceMemberId(person.id),
            organizationId: id,
            userId: person.id,
            role: "owner",
            createdAt: now,
          })
          .onConflictDoNothing({ target: member.id }),
        ...ADOPTED_TABLES.map((table) =>
          db
            .update(table)
            .set({ organizationId: id })
            .where(
              and(eq(table.userId, person.id), isNull(table.organizationId)),
            ),
        ),
        // OAuth apps belong to their owner; first-party apps have none and stay.
        db
          .update(oauthApp)
          .set({ organizationId: id })
          .where(
            and(
              eq(oauthApp.ownerUserId, person.id),
              isNull(oauthApp.organizationId),
            ),
          ),
      ]);
    } catch (error) {
      // Somebody else took the slug in between: try the next one.
      if (isUniqueViolation(error)) {
        taken = new Set([...taken, slug]);
        continue;
      }
      throw error;
    }
    const created = await findWorkspaceById(person.id, id);
    if (created) return created;
    break;
  }
  throw new Error("Could not create the user's own workspace");
}

/** ensureOwnWorkspace for a user known only by id (API tokens, keys). */
export async function ensureOwnWorkspaceFor(
  userId: string,
): Promise<Workspace> {
  const existing = await findWorkspaceById(userId, ownWorkspaceId(userId));
  if (existing) return existing;
  const [person] = await db
    .select({ id: userTable.id, name: userTable.name, email: userTable.email })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);
  if (!person) throw new Error("User not found");
  return ensureOwnWorkspace(person);
}

/**
 * The user's workspaces, making their own workspace first if they don't have
 * it yet (accounts from before workspaces, until the backfill has run).
 */
export async function loadWorkspaces(
  person: WorkspaceUser,
): Promise<Workspace[]> {
  const workspaces = await listWorkspaces(person.id);
  if (workspaces.some((workspace) => workspace.own)) return workspaces;
  await ensureOwnWorkspace(person);
  return listWorkspaces(person.id);
}

/**
 * Where /dashboard and pages outside a workspace work: the workspace last
 * opened in this session (lib/scope.ts keeps the session in step, and
 * sign-in starts from the one last opened anywhere), else your own, else the
 * first you joined.
 */
export function pickDefaultWorkspace(
  workspaces: readonly Workspace[],
  activeOrganizationId: string | null | undefined,
): Workspace | null {
  return (
    workspaces.find((workspace) => workspace.id === activeOrganizationId) ??
    workspaces.find((workspace) => workspace.own) ??
    workspaces[0] ??
    null
  );
}

export async function defaultWorkspace(
  person: WorkspaceUser,
  activeOrganizationId: string | null | undefined,
): Promise<Workspace> {
  const workspace = pickDefaultWorkspace(
    await loadWorkspaces(person),
    activeOrganizationId,
  );
  if (!workspace) throw new Error("The user has no workspace");
  return workspace;
}

/**
 * Remembers the workspace last opened, so the next sign-in starts there
 * (packages/auth/server.ts reads it when a session is created). A merge in
 * one statement, so it never drops other settings.
 */
export async function rememberLastWorkspace(
  userId: string,
  organizationId: string,
): Promise<void> {
  try {
    await db
      .update(userTable)
      .set({
        settings: sql`(coalesce(${userTable.settings}::jsonb, '{}'::jsonb) || jsonb_build_object('lastWorkspaceId', ${organizationId}::text))::json`,
      })
      .where(eq(userTable.id, userId));
  } catch (error) {
    logError(error as Error, { action: "workspaces.rememberLastWorkspace" });
  }
}
