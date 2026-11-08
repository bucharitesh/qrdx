import "server-only";

import {
  customDomain,
  database as db,
  member,
  qrCode,
  qrCodeTag,
} from "@repo/database";
import { and, eq, isNull } from "drizzle-orm";
import { HttpError } from "@/lib/error-response";
import { can, forbiddenMessage } from "@/lib/permissions";
import { assertCan } from "@/lib/permissions-server";
import { getPlanForScope, getPlanLimits } from "@/lib/plans";
import type { ActiveScope } from "@/lib/scope";
import {
  findWorkspaceById,
  listWorkspaces,
  shutsOut,
  TwoFactorRequiredError,
} from "@/lib/workspaces";
import { countUnarchived, getCode, type QrCodeView } from "./qr-codes";

// Moving a dynamic code to another workspace (the code row menu, "Move to
// workspace…"). The short link never changes, because printed codes must
// keep working: the slug, its namespace and the domain stay as they are, so
// a code on a custom domain can't move (the domain belongs to this
// workspace). Scans, versions and conversions hang off the code's id, so
// they move with it. Folders and tags belong to a workspace, so the code
// leaves them behind.

export interface MoveTarget {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
}

/**
 * Workspaces the person may add codes to, other than the open one (not one
 * that requires two-step verification they haven't turned on).
 */
export async function listMoveTargets(
  scope: ActiveScope,
): Promise<MoveTarget[]> {
  const workspaces = (await listWorkspaces(scope.userId)).filter(
    (workspace) =>
      workspace.id !== scope.organizationId &&
      can(workspace.role, "content.write"),
  );
  const open = await Promise.all(
    workspaces.map(
      async (workspace) => !(await shutsOut(scope.userId, workspace)),
    ),
  );
  return workspaces
    .filter((_, index) => open[index])
    .map(({ id, name, slug, logo }) => ({ id, name, slug, logo }));
}

export interface MoveResult {
  code: QrCodeView;
  target: { id: string; name: string; slug: string };
  /** What stayed behind: its folder and how many tags */
  leftBehind: { folder: boolean; tags: number };
}

const notFound = () => new HttpError(404, "NOT_FOUND", "QR code not found");

/**
 * Moves the code `id` from the scope's workspace to `targetId`. Needs the
 * right to delete it here (members: their own codes) and to create codes
 * there, and room under the target plan's active-code limit.
 */
export async function moveCodeToWorkspace(
  scope: ActiveScope,
  id: string,
  targetId: string,
): Promise<MoveResult> {
  assertCan(scope, "content.write");
  if (targetId === scope.organizationId) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "The code is already in this workspace.",
    );
  }
  const target = await findWorkspaceById(scope.userId, targetId);
  if (!target) {
    throw new HttpError(404, "NOT_FOUND", "Workspace not found.");
  }
  const targetScope: ActiveScope = {
    userId: scope.userId,
    organizationId: target.id,
    role: target.role,
  };
  if (!can(target.role, "content.write")) {
    throw new HttpError(
      403,
      "FORBIDDEN",
      `You can't add codes to ${target.name}. ${forbiddenMessage(target.role, "content.write")}`,
    );
  }
  if (await shutsOut(scope.userId, target)) throw new TwoFactorRequiredError();

  const [row] = await db
    .select()
    .from(qrCode)
    .where(
      and(
        eq(qrCode.id, id),
        eq(qrCode.organizationId, scope.organizationId),
        isNull(qrCode.deletedAt),
      ),
    )
    .limit(1);
  if (!row) throw notFound();
  if (!can(scope.role, "content.manageAll") && row.userId !== scope.userId) {
    throw new HttpError(
      403,
      "FORBIDDEN",
      "Only owners and admins can move codes that other members created.",
    );
  }
  if (row.kind === "page" || row.pageId) {
    throw new HttpError(
      400,
      "PAGE_CODE",
      "Codes that open a hosted page can't move to another workspace: the page stays here.",
    );
  }
  if (row.domainId) {
    const [domain] = await db
      .select({
        hostname: customDomain.hostname,
        organizationId: customDomain.organizationId,
      })
      .from(customDomain)
      .where(eq(customDomain.id, row.domainId))
      .limit(1);
    if (domain && domain.organizationId !== target.id) {
      throw new HttpError(
        400,
        "DOMAIN_NOT_IN_TARGET",
        `This code's link is on ${domain.hostname}, which ${target.name} doesn't have. Its printed link would stop working, so it can't move.`,
      );
    }
  }

  const limits = getPlanLimits(await getPlanForScope(targetScope));
  const capped = !row.archivedAt && Number.isFinite(limits.dynamicCodes);
  const full = async () =>
    capped && (await countUnarchived(targetScope)) >= limits.dynamicCodes;
  const limitError = () =>
    new HttpError(
      402,
      "LIMIT_REACHED",
      `${target.name} has used all ${limits.dynamicCodes} active dynamic codes its plan includes. Archive one there, or archive this code first.`,
    );
  if (await full()) throw limitError();

  // The creator keeps the code when they're a member there; otherwise the
  // mover takes it over, so someone in the target workspace owns it.
  const [creator] = await db
    .select({ id: member.id })
    .from(member)
    .where(
      and(eq(member.organizationId, target.id), eq(member.userId, row.userId)),
    )
    .limit(1);
  const tags = await db
    .select({ tagId: qrCodeTag.tagId })
    .from(qrCodeTag)
    .where(eq(qrCodeTag.qrCodeId, id));

  const moved = await db.batch([
    db
      .update(qrCode)
      .set({
        organizationId: target.id,
        folderId: null,
        ...(creator ? {} : { userId: scope.userId }),
      })
      .where(
        and(eq(qrCode.id, id), eq(qrCode.organizationId, scope.organizationId)),
      )
      .returning({ id: qrCode.id }),
    db.delete(qrCodeTag).where(eq(qrCodeTag.qrCodeId, id)),
  ]);
  if ((moved[0] as { id: string }[]).length === 0) throw notFound();

  // Concurrent creates there can pass the check above: undo when over.
  if (capped && (await countUnarchived(targetScope)) > limits.dynamicCodes) {
    await db.batch([
      db
        .update(qrCode)
        .set({
          organizationId: scope.organizationId,
          folderId: row.folderId,
          userId: row.userId,
        })
        .where(eq(qrCode.id, id)),
      ...(tags.length > 0
        ? [
            db
              .insert(qrCodeTag)
              .values(tags.map(({ tagId }) => ({ qrCodeId: id, tagId })))
              .onConflictDoNothing(),
          ]
        : []),
    ]);
    throw limitError();
  }

  return {
    code: await getCode(targetScope, id),
    target: { id: target.id, name: target.name, slug: target.slug },
    leftBehind: { folder: Boolean(row.folderId), tags: tags.length },
  };
}
