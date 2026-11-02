import "server-only";
import * as schema from "@repo/database";
import { and, database as db, eq } from "@repo/database";
import { APIError } from "better-auth/api";
import { ownWorkspaceId, ownWorkspaceMemberId } from "./own-workspace-id";
import {
  nextFreeSlug,
  ownWorkspaceName,
  ownWorkspaceSlugBase,
  workspaceSlugProblem,
} from "./workspace-rules";

// Workspaces (Better Auth organizations) as QRdx uses them, enforced where
// the plugin's own HTTP endpoints can reach them too:
// - slugs are URLs (/dashboard/<slug>), so they follow the slug rules and
//   never use a reserved word, on create and on rename;
// - everyone keeps their own workspace: it can't be deleted, left, or have
//   its person removed or demoted (account deletion removes it directly);
// - deleting any other workspace hands each row back to the own workspace of
//   the member who created it, so codes keep working and stay manageable.
// The app's lazy path (apps/docs/lib/workspaces.ts) creates own workspaces
// the same way, with the same ids.

function badRequest(message: string): APIError {
  return new APIError("BAD_REQUEST", { message });
}

export function assertWorkspaceSlug(slug: unknown): void {
  if (typeof slug !== "string") return;
  const problem = workspaceSlugProblem(slug);
  if (problem) throw badRequest(problem);
}

/** A Postgres unique violation (23505), also when drizzle wraps it. */
function isUniqueViolation(error: unknown): boolean {
  for (let e = error, depth = 0; e && depth < 4; depth++) {
    if (typeof e !== "object") return false;
    const { code, cause } = e as { code?: unknown; cause?: unknown };
    if (code === "23505") return true;
    e = cause;
  }
  return false;
}

/** Creates the new user's own workspace (idempotent; failures are logged). */
export async function createOwnWorkspace(person: {
  id: string;
  name?: string | null;
  email: string;
}): Promise<void> {
  const id = ownWorkspaceId(person.id);
  const base = ownWorkspaceSlugBase(person);
  const taken = new Set(
    (
      await db.query.organization.findMany({
        columns: { slug: true },
        where: (table, { eq: equals, like, or }) =>
          or(equals(table.slug, base), like(table.slug, `${base}-%`)),
      })
    ).map((row) => row.slug)
  );
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = nextFreeSlug(base, taken);
    const now = new Date();
    try {
      await db.batch([
        db
          .insert(schema.organization)
          .values({ id, name: ownWorkspaceName(person), slug, createdAt: now })
          .onConflictDoNothing({ target: schema.organization.id }),
        db
          .insert(schema.member)
          .values({
            id: ownWorkspaceMemberId(person.id),
            organizationId: id,
            userId: person.id,
            role: "owner",
            createdAt: now,
          })
          .onConflictDoNothing({ target: schema.member.id }),
      ]);
      return;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      taken.add(slug);
    }
  }
}

async function isMember(userId: string, organizationId: string) {
  const row = await db.query.member.findFirst({
    columns: { id: true },
    where: (table, { and: both, eq: equals }) =>
      both(
        equals(table.userId, userId),
        equals(table.organizationId, organizationId)
      ),
  });
  return Boolean(row);
}

/**
 * The workspace a new session starts in: the one last opened anywhere
 * (user.settings.lastWorkspaceId), else the user's own, while they are a
 * member. Null leaves it to the app (lib/workspaces.ts defaultWorkspace).
 */
export async function initialWorkspaceId(
  userId: string
): Promise<string | null> {
  const row = await db.query.user.findFirst({
    columns: { settings: true },
    where: (table, { eq: equals }) => equals(table.id, userId),
  });
  const last = (row?.settings as { lastWorkspaceId?: unknown } | null)
    ?.lastWorkspaceId;
  for (const candidate of [
    typeof last === "string" ? last : null,
    ownWorkspaceId(userId),
  ]) {
    if (candidate && (await isMember(userId, candidate))) return candidate;
  }
  return null;
}

/** Owners' own workspaces can't be deleted (only with the account). */
export async function assertDeletable(organizationId: string): Promise<void> {
  const members = await db.query.member.findMany({
    columns: { userId: true },
    where: (table, { eq: equals }) =>
      equals(table.organizationId, organizationId),
  });
  if (members.some((m) => ownWorkspaceId(m.userId) === organizationId)) {
    throw badRequest(
      "This is someone's own workspace, so it can't be deleted. Rename it instead."
    );
  }
}

export function assertNotOwnMember(
  organizationId: string,
  userId: string,
  message: string
): void {
  if (ownWorkspaceId(userId) === organizationId) throw badRequest(message);
}

/**
 * Tables whose rows belong to a workspace and record who created them. API
 * keys aren't here: a workspace's keys are deleted with it (ON DELETE
 * cascade), so a key never starts acting on a different workspace.
 */
const CREATED_ROWS = [
  schema.qrCode,
  schema.landingPage,
  schema.customDomain,
  schema.qrPreset,
  schema.brandKit,
  schema.fileAsset,
  schema.folder,
  schema.tag,
  schema.webhookEndpoint,
  schema.notificationSetting,
] as const;

/**
 * Before a workspace is deleted: every row goes to the own workspace of the
 * member who created it. Creators without one yet (accounts from before
 * workspaces) get the row back with no workspace, as before, and the app or
 * the backfill moves it into theirs when it's made.
 */
export async function handRowsBackToCreators(
  organizationId: string
): Promise<void> {
  const creators = new Set<string>();
  for (const table of CREATED_ROWS) {
    const rows = await db
      .selectDistinct({ userId: table.userId })
      .from(table)
      .where(eq(table.organizationId, organizationId));
    for (const row of rows) creators.add(row.userId);
  }
  const apps = await db
    .selectDistinct({ userId: schema.oauthApp.ownerUserId })
    .from(schema.oauthApp)
    .where(eq(schema.oauthApp.organizationId, organizationId));
  for (const row of apps) if (row.userId) creators.add(row.userId);

  for (const userId of creators) {
    const own = ownWorkspaceId(userId);
    if (!(await isMember(userId, own))) continue;
    await db.batch([
      db
        .update(schema.oauthApp)
        .set({ organizationId: own })
        .where(
          and(
            eq(schema.oauthApp.organizationId, organizationId),
            eq(schema.oauthApp.ownerUserId, userId)
          )
        ),
      ...CREATED_ROWS.map((table) =>
        db
          .update(table)
          .set({ organizationId: own })
          .where(
            and(
              eq(table.organizationId, organizationId),
              eq(table.userId, userId)
            )
          )
      ),
    ]);
  }
}
