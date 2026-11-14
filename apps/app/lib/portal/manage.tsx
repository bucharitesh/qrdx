import "server-only";

import {
  database as db,
  folder,
  organization,
  portalClient,
  portalClientFolder,
  user,
} from "@repo/database";
import cuid from "cuid";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { agencyPlanRequired, findPortalBrand } from "@/lib/client-brands";
import { isMissingSchemaError } from "@/lib/community/tables";
import { isEmailConfigured, sendEmail } from "@/lib/email/send";
import {
  PortalInviteEmail,
  portalInviteSubject,
} from "@/lib/email/templates/portal-invite";
import { HttpError } from "@/lib/error-response";
import { baseUrl } from "@/lib/metadata";
import { assertCan } from "@/lib/permissions-server";
import { getPlanForScope, getPlanLimits } from "@/lib/plans";
import { portalPath } from "@/lib/portal/paths";
import type { ActiveScope } from "@/lib/scope";
import { logError } from "@/lib/shared";

// Managing a workspace's portal clients (Settings → Client portal): owners
// and admins ("members.manage": inviting people from outside), on Business.

export interface PortalClientView {
  id: string;
  email: string;
  name: string | null;
  folderIds: string[];
  invitedAt: string;
  acceptedAt: string | null;
  lastSeenAt: string | null;
}

/** The agency tables aren't there yet (manual-sql/2026-11-11-agency.sql). */
export class PortalUnavailableError extends HttpError {
  constructor() {
    super(
      503,
      "UNAVAILABLE",
      "The client portal isn't available on this server yet.",
    );
    this.name = "PortalUnavailableError";
  }
}

async function guarded<T>(query: () => Promise<T>): Promise<T> {
  try {
    return await query();
  } catch (error) {
    if (isMissingSchemaError(error)) throw new PortalUnavailableError();
    throw error;
  }
}

export const PORTAL_CLIENTS_MAX = 1000;

const inputSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Enter the client's email address.").max(254)),
  name: z
    .string()
    .trim()
    .max(80, "Keep the name under 80 characters.")
    .transform((value) => value || null),
  folderIds: z
    .array(z.string().trim().min(1).max(64))
    .max(500)
    .transform((ids) => [...new Set(ids)]),
});

export type PortalClientInput = z.input<typeof inputSchema>;

async function assertManage(scope: ActiveScope) {
  assertCan(scope, "members.manage");
  if (!getPlanLimits(await getPlanForScope(scope)).clientPortal) {
    throw agencyPlanRequired("The client portal", (l) => l.clientPortal);
  }
}

function parse(input: PortalClientInput) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "Check the form and try again.",
    );
  }
  return { ...parsed.data, email: parsed.data.email.trim().toLowerCase() };
}

/** Only folders of this workspace; anything else is refused. */
async function checkFolders(scope: ActiveScope, folderIds: string[]) {
  if (folderIds.length === 0) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "Choose at least one folder to share.",
    );
  }
  const rows = await db
    .select({ id: folder.id, name: folder.name })
    .from(folder)
    .where(
      and(
        eq(folder.organizationId, scope.organizationId),
        inArray(folder.id, folderIds),
      ),
    );
  if (rows.length !== folderIds.length) {
    throw new HttpError(404, "NOT_FOUND", "Folder not found.");
  }
  return rows;
}

/** The workspace's clients, by email. */
export async function listPortalClients(
  scope: ActiveScope,
): Promise<PortalClientView[]> {
  assertCan(scope, "members.manage");
  const [clients, links] = await guarded(() =>
    Promise.all([
      db
        .select()
        .from(portalClient)
        .where(eq(portalClient.organizationId, scope.organizationId))
        .orderBy(asc(portalClient.email))
        .limit(PORTAL_CLIENTS_MAX),
      db
        .select({
          clientId: portalClientFolder.clientId,
          folderId: portalClientFolder.folderId,
        })
        .from(portalClientFolder)
        .innerJoin(folder, eq(folder.id, portalClientFolder.folderId))
        .where(eq(folder.organizationId, scope.organizationId)),
    ]),
  );
  return clients.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    folderIds: links
      .filter((link) => link.clientId === row.id)
      .map((link) => link.folderId),
    invitedAt: row.createdAt.toISOString(),
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
  }));
}

async function findClient(scope: ActiveScope, id: string) {
  const [row] = await guarded(() =>
    db
      .select()
      .from(portalClient)
      .where(
        and(
          eq(portalClient.id, id),
          eq(portalClient.organizationId, scope.organizationId),
        ),
      )
      .limit(1),
  );
  if (!row) throw new HttpError(404, "NOT_FOUND", "Client not found.");
  return row;
}

async function replaceFolders(clientId: string, folderIds: string[]) {
  await db
    .delete(portalClientFolder)
    .where(eq(portalClientFolder.clientId, clientId));
  if (folderIds.length > 0) {
    await db
      .insert(portalClientFolder)
      .values(folderIds.map((folderId) => ({ clientId, folderId })))
      .onConflictDoNothing();
  }
}

/** The portal's name as clients see it, for the invitation. */
async function portalName(scope: ActiveScope): Promise<string> {
  const [brand, [org]] = await Promise.all([
    findPortalBrand(scope.organizationId).catch(() => null),
    db
      .select({ name: organization.name, slug: organization.slug })
      .from(organization)
      .where(eq(organization.id, scope.organizationId))
      .limit(1),
  ]);
  return brand?.name?.trim() || org?.name || "Your agency";
}

async function workspaceSlug(scope: ActiveScope): Promise<string> {
  const [org] = await db
    .select({ slug: organization.slug })
    .from(organization)
    .where(eq(organization.id, scope.organizationId))
    .limit(1);
  if (!org) throw new HttpError(404, "NOT_FOUND", "Workspace not found.");
  return org.slug;
}

/** The portal's address on this server. */
export async function portalUrlFor(scope: ActiveScope): Promise<string> {
  return new URL(
    portalPath(await workspaceSlug(scope)),
    baseUrl.origin,
  ).toString();
}

/**
 * Emails the client their portal link. False when email isn't set up or
 * sending failed: the settings page shows the link to send by hand.
 */
async function sendInvite(
  scope: ActiveScope,
  email: string,
  folderNames: string[],
): Promise<boolean> {
  if (!isEmailConfigured) return false;
  try {
    const [[inviter], name, url] = await Promise.all([
      db
        .select({ name: user.name, email: user.email })
        .from(user)
        .where(eq(user.id, scope.userId))
        .limit(1),
      portalName(scope),
      portalUrlFor(scope),
    ]);
    const result = await sendEmail({
      to: email,
      subject: portalInviteSubject(name),
      react: (
        <PortalInviteEmail
          folders={folderNames}
          inviterName={inviter?.name || inviter?.email || "Your agency"}
          portalName={name}
          portalUrl={url}
        />
      ),
      tags: [{ name: "kind", value: "portal-invite" }],
    });
    return result.sent;
  } catch (error) {
    logError(error as Error, { action: "portal.sendInvite" });
    return false;
  }
}

/**
 * Invites a client, or, for an address already invited, changes their
 * name and folders and sends the link again. Returns whether it emailed.
 */
export async function invitePortalClient(
  scope: ActiveScope,
  input: PortalClientInput,
): Promise<{ client: PortalClientView; emailed: boolean }> {
  await assertManage(scope);
  const data = parse(input);
  const folders = await checkFolders(scope, data.folderIds);
  const existing = (await listPortalClients(scope)).find(
    (row) => row.email === data.email,
  );
  if (!existing) {
    const count = (await listPortalClients(scope)).length;
    if (count >= PORTAL_CLIENTS_MAX) {
      throw new HttpError(
        400,
        "VALIDATION_ERROR",
        `A workspace can invite up to ${PORTAL_CLIENTS_MAX} clients.`,
      );
    }
  }
  const id = existing?.id ?? cuid();
  await guarded(async () => {
    if (existing) {
      await db
        .update(portalClient)
        .set({ name: data.name })
        .where(
          and(
            eq(portalClient.id, id),
            eq(portalClient.organizationId, scope.organizationId),
          ),
        );
    } else {
      await db
        .insert(portalClient)
        .values({
          id,
          organizationId: scope.organizationId,
          email: data.email,
          name: data.name,
          invitedBy: scope.userId,
          createdAt: new Date(),
        })
        .onConflictDoNothing();
    }
    await replaceFolders(id, data.folderIds);
  });
  const emailed = await sendInvite(
    scope,
    data.email,
    folders.map((row) => row.name),
  );
  const client = (await listPortalClients(scope)).find((row) => row.id === id);
  if (!client) throw new HttpError(409, "CONFLICT", "Try again.");
  return { client, emailed };
}

/** Changes which folders a client sees; takes effect on their next page. */
export async function updatePortalClient(
  scope: ActiveScope,
  id: string,
  input: Omit<PortalClientInput, "email">,
): Promise<PortalClientView> {
  await assertManage(scope);
  const existing = await findClient(scope, id);
  const data = parse({ ...input, email: existing.email });
  await checkFolders(scope, data.folderIds);
  await guarded(async () => {
    await db
      .update(portalClient)
      .set({ name: data.name })
      .where(
        and(
          eq(portalClient.id, id),
          eq(portalClient.organizationId, scope.organizationId),
        ),
      );
    await replaceFolders(id, data.folderIds);
  });
  const client = (await listPortalClients(scope)).find((row) => row.id === id);
  if (!client) throw new HttpError(404, "NOT_FOUND", "Client not found.");
  return client;
}

/** Removes a client: their next page load is a "no access" page. */
export async function removePortalClient(
  scope: ActiveScope,
  id: string,
): Promise<void> {
  // Removing always works, whatever the plan: it only takes access away.
  assertCan(scope, "members.manage");
  await findClient(scope, id);
  await guarded(() =>
    db.delete(portalClientFolder).where(eq(portalClientFolder.clientId, id)),
  );
  await guarded(() =>
    db
      .delete(portalClient)
      .where(
        and(
          eq(portalClient.id, id),
          eq(portalClient.organizationId, scope.organizationId),
        ),
      ),
  );
}
