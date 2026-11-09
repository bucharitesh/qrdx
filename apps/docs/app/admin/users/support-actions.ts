"use server";

import { hasAdminRole, isAdmin } from "@repo/auth/admin";
import { twoFactorResetDueAt } from "@repo/auth/two-factor-reset";
import {
  account,
  database as db,
  integration,
  invitation,
  member,
  oauthApp,
  organization,
  session,
  user,
  webhookDelivery,
  webhookEndpoint,
} from "@repo/database";
import { and, count, eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { after } from "next/server";
import { z } from "zod";
import { scheduleWorkspaceAuditCleanup } from "@/ee/audit-log/retention";
import { CONFIRMATION_REQUIRED } from "@/lib/account/confirmation";
import {
  currentSession,
  hasRecentStrongConfirmation,
} from "@/lib/account/confirmation-server";
import { isSameEmail, MAX_EMAIL_LENGTH } from "@/lib/account/email-change";
import { afterEmailChanged } from "@/lib/account/email-change-server";
import {
  resetNoticeDelivered,
  resetNoticeRefusal,
} from "@/lib/account/two-factor-notice";
import {
  cancelTwoFactorReset,
  loadPendingTwoFactorReset,
  notifyTwoFactorResetScheduled,
  scheduleTwoFactorReset,
} from "@/lib/account/two-factor-reset-server";
import { twoFactorEnabledFor } from "@/lib/account/two-factor-server";
import { revokeStoredToken } from "@/lib/connected-accounts/server";
import { cleanupDataConnection } from "@/lib/data-connections/server";
import { isOutboundDeliveryAllowed } from "@/lib/delivery-guard";
import { isEmailConfigured } from "@/lib/email/send";
import { claimDueDeliveries, processClaimed } from "@/lib/events/deliveries";
import { importJobSchema, jobStoreSchema } from "@/lib/migrate/jobs";
import { JOB_STORE_PROVIDER } from "@/lib/migrate/server/repo";
import type { ImportJob } from "@/lib/migrate/types";
import {
  type AdminActionResult,
  adminError,
  runAdminAction,
} from "../_lib/action";
import {
  adminId,
  cancelImportJob,
  canUnlinkSignInMethod,
  confirmsEmail,
  isStuckImport,
  requeueImportJob,
  requiredReason,
  resentInvitationExpiry,
  signInMethodLabel,
} from "../_lib/rules";

// Support actions on the user 360 page (/admin/users/<id>). Each one goes
// through runAdminAction: admin re-check, rate limit, reason, audit entry.

const userReason = z.object({ userId: adminId, reason: requiredReason });

async function findUser(userId: string) {
  const [found] = await db
    .select({
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!found) throw adminError("User not found", 404);
  return found;
}

// ─── Account ─────────────────────────────────────────────────────────────────

/** For people who can't receive the code but proved ownership another way. */
export async function markEmailVerifiedAction(
  input: z.input<typeof userReason>,
): Promise<AdminActionResult> {
  return runAdminAction(
    { action: "user.mark_email_verified", schema: userReason },
    input,
    async (_admin, { userId }) => {
      const target = await findUser(userId);
      if (target.emailVerified) return null;
      await db
        .update(user)
        .set({ emailVerified: true, updatedAt: new Date() })
        .where(eq(user.id, userId));
      return {
        audit: {
          targetType: "user",
          targetId: userId,
          subjectUserId: userId,
          metadata: { targetEmail: target.email },
        },
      };
    },
  );
}

/**
 * The admin's own checks for a support action that hands an account over or
 * removes its protection: two-step verification on their own account and a
 * confirmation in the last 10 minutes with a passkey, an authenticator code
 * or a backup code (CONFIRMATION_REQUIRED opens that dialog). A stolen admin
 * cookie alone isn't enough.
 */
async function requireStrongAdmin(admin: { id: string }): Promise<void> {
  if (!(await twoFactorEnabledFor(admin.id))) {
    throw adminError(
      "Turn on two-step verification for your own account first.",
    );
  }
  const adminSession = await currentSession();
  if (
    !(
      adminSession?.userId === admin.id &&
      (await hasRecentStrongConfirmation(adminSession))
    )
  ) {
    throw adminError(CONFIRMATION_REQUIRED, 403);
  }
}

/**
 * For someone who lost their authenticator app, passkeys and backup codes,
 * once they wrote to support from the account's address. Nothing changes
 * yet: the reset waits 7 days (lib/account/two-factor-reset-server.ts) and
 * the address is told the day, so an owner who didn't ask can cancel it
 * (in Settings, or by signing in with an authenticator code or a backup
 * code) or reply. On that day the daily cron turns two-step verification
 * off (secret, backup codes and trusted devices gone), signs out every
 * session of the account and emails the address.
 *
 * The notice is the point of the wait, so it goes out first, and nothing is
 * scheduled unless it did (resetNoticeDelivered: never from a server that
 * can't email, such as a preview or a local server, unless that local
 * server's database is a throwaway one started with QRDX_DISPOSABLE_DB=1).
 *
 * Whoever wrote in may not be the owner, so a stolen admin cookie must not be
 * enough to start it: requireStrongAdmin, as for changing the email. Never
 * for an admin's account (a role, or ADMIN_EMAILS / ADMIN_USER_IDS) or the
 * admin's own.
 */
export async function resetTwoFactorAction(
  input: z.input<typeof userReason>,
): Promise<AdminActionResult<{ dueAt: string }>> {
  return runAdminAction(
    { action: "user.reset_two_factor", schema: userReason, limit: "sensitive" },
    input,
    async (admin, { userId }) => {
      if (userId === admin.id) {
        throw adminError(
          "You can't do this for your own account. Use Settings → Profile & security.",
        );
      }
      const [target] = await db
        .select({
          id: user.id,
          email: user.email,
          // isAdmin also counts ADMIN_EMAILS, for verified addresses only.
          emailVerified: user.emailVerified,
          on: user.twoFactorEnabled,
          role: user.role,
        })
        .from(user)
        .where(eq(user.id, userId))
        .limit(1);
      if (!target) throw adminError("User not found", 404);
      if (isAdmin(target)) {
        throw adminError(
          "An admin's two-step verification can't be turned off here.",
        );
      }
      if (!target.on) throw adminError("Two-step verification is already off.");
      if (await loadPendingTwoFactorReset(userId)) {
        throw adminError("A reset is already waiting for this account.");
      }
      await requireStrongAdmin(admin);
      // The notice first, with the day the reset will have; the reset only
      // if it went out. (Should saving it then fail, the address was told
      // about a reset that isn't waiting: the admin sees the error, and the
      // day passes with nothing changed.)
      const now = new Date();
      const notice = await notifyTwoFactorResetScheduled(target.email, {
        dueAt: twoFactorResetDueAt(now),
      });
      if (
        !resetNoticeDelivered(notice, {
          nodeEnv: process.env.NODE_ENV,
          disposableDb: process.env.QRDX_DISPOSABLE_DB,
        })
      ) {
        throw adminError(
          resetNoticeRefusal(notice, {
            canSendEmail: isOutboundDeliveryAllowed() && isEmailConfigured,
          }),
        );
      }
      const pending = await scheduleTwoFactorReset({ userId, admin, now });
      return {
        audit: {
          targetType: "user",
          targetId: userId,
          subjectUserId: userId,
          metadata: {
            targetEmail: target.email,
            dueAt: pending.dueAt.toISOString(),
          },
        },
        data: { dueAt: pending.dueAt.toISOString() },
      };
    },
  );
}

/**
 * Stops a pending reset (say the owner replied that it wasn't them). Two-step
 * verification stays as it is, and the address is told. Cancelling one the
 * owner really asked for leaves them locked out, so it takes the same
 * requireStrongAdmin as starting one: not a stolen admin cookie alone.
 */
export async function cancelTwoFactorResetAction(
  input: z.input<typeof userReason>,
): Promise<AdminActionResult> {
  return runAdminAction(
    { action: "user.reset_two_factor_cancel", schema: userReason },
    input,
    async (admin, { userId }) => {
      const target = await findUser(userId);
      if (!(await loadPendingTwoFactorReset(userId))) {
        throw adminError("No reset is waiting for this account.");
      }
      await requireStrongAdmin(admin);
      const cancelled = await cancelTwoFactorReset(
        { id: userId, email: target.email },
        "support",
      );
      if (!cancelled) throw adminError("No reset is waiting for this account.");
      return {
        audit: {
          targetType: "user",
          targetId: userId,
          subjectUserId: userId,
          metadata: { targetEmail: target.email, by: "support" },
        },
      };
    },
  );
}

const changeEmailSchema = userReason.extend({
  newEmail: z.string().trim().toLowerCase().email().max(MAX_EMAIL_LENGTH),
});

/**
 * For someone who lost their mailbox and has no other way to confirm it's
 * them, only after the checks in the lost-email policy (the help page
 * content/docs/help/account-and-billing/sign-in.mdx, "Lost access to your
 * email"). The account moves to the new address, marked verified (support
 * had a reply from it); every session is signed out, and the old address
 * gets the "email changed" notice, by QRdx support.
 *
 * This hands an account to whoever controls the new address, so a stolen
 * admin cookie must not be enough: the admin needs two-step verification
 * on their own account and a confirmation in the last 10 minutes with a
 * passkey, an authenticator code or a backup code (CONFIRMATION_REQUIRED
 * opens that dialog). Never for an admin's account or the admin's own.
 */
export async function changeEmailAction(
  input: z.input<typeof changeEmailSchema>,
): Promise<AdminActionResult> {
  return runAdminAction(
    {
      action: "user.change_email",
      schema: changeEmailSchema,
      limit: "sensitive",
    },
    input,
    async (admin, { userId, newEmail }) => {
      if (userId === admin.id) {
        throw adminError(
          "You can't move your own account here. Use Settings → Profile & security.",
        );
      }
      const [target] = await db
        .select({
          id: user.id,
          email: user.email,
          emailVerified: user.emailVerified,
          role: user.role,
        })
        .from(user)
        .where(eq(user.id, userId))
        .limit(1);
      if (!target) throw adminError("User not found", 404);
      if (isAdmin(target)) {
        throw adminError("An admin's account can't be moved here.");
      }
      await requireStrongAdmin(admin);
      if (isSameEmail(target.email, newEmail)) {
        throw adminError("That's already this account's email.");
      }
      const [taken] = await db
        .select({ id: user.id })
        .from(user)
        .where(sql`lower(${user.email}) = ${newEmail}`)
        .limit(1);
      if (taken) {
        throw adminError("That email already belongs to another QRdx account.");
      }
      await db.batch([
        db
          .update(user)
          .set({ email: newEmail, emailVerified: true, updatedAt: new Date() })
          .where(eq(user.id, userId)),
        db.delete(session).where(eq(session.userId, userId)),
      ]);
      after(() =>
        afterEmailChanged({
          userId,
          previousEmail: target.email,
          newEmail,
          bySupport: true,
        }),
      );
      return {
        audit: {
          targetType: "user",
          targetId: userId,
          subjectUserId: userId,
          metadata: { targetEmail: target.email, newEmail },
        },
      };
    },
  );
}

const unlinkSchema = userReason.extend({ accountId: adminId });

/** Removes a linked GitHub / Google sign-in; never the user's last one. */
export async function unlinkSignInMethodAction(
  input: z.input<typeof unlinkSchema>,
): Promise<AdminActionResult> {
  return runAdminAction(
    { action: "user.unlink_sign_in", schema: unlinkSchema },
    input,
    async (_admin, { userId, accountId }) => {
      const target = await findUser(userId);
      const accounts = await db
        .select({ id: account.id, providerId: account.providerId })
        .from(account)
        .where(eq(account.userId, userId));
      const check = canUnlinkSignInMethod(accounts, accountId);
      if (!check.ok) throw adminError(check.error);
      const removed = accounts.find((row) => row.id === accountId);

      await db
        .delete(account)
        .where(and(eq(account.id, accountId), eq(account.userId, userId)));
      return {
        audit: {
          targetType: "user",
          targetId: userId,
          subjectUserId: userId,
          metadata: {
            targetEmail: target.email,
            provider: removed?.providerId ?? null,
            providerLabel: removed
              ? signInMethodLabel(removed.providerId)
              : null,
          },
        },
      };
    },
  );
}

// ─── Webhooks ────────────────────────────────────────────────────────────────

const deliverySchema = z.object({
  deliveryId: adminId,
  reason: requiredReason,
});

/**
 * Sends a failed (or stuck pending) delivery once more through the normal
 * worker, which still applies the endpoint's state and plan checks. Outside
 * production nothing leaves the server (lib/delivery-guard).
 */
export async function retryWebhookDeliveryAction(
  input: z.input<typeof deliverySchema>,
): Promise<AdminActionResult<{ status: string; error: string | null }>> {
  return runAdminAction(
    { action: "webhook_delivery.retry", schema: deliverySchema },
    input,
    async (_admin, { deliveryId }) => {
      const [row] = await db
        .select({
          status: webhookDelivery.status,
          event: webhookDelivery.event,
          endpointId: webhookDelivery.endpointId,
          ownerId: webhookEndpoint.userId,
          url: webhookEndpoint.url,
        })
        .from(webhookDelivery)
        .innerJoin(
          webhookEndpoint,
          eq(webhookEndpoint.id, webhookDelivery.endpointId),
        )
        .where(eq(webhookDelivery.id, deliveryId))
        .limit(1);
      if (!row) throw adminError("Delivery not found", 404);
      if (row.status === "succeeded") {
        throw adminError("This delivery already succeeded");
      }

      // Due now (database clock), then claimed and sent like any retry.
      await db
        .update(webhookDelivery)
        .set({ status: "pending", nextAttemptAt: sql`now()` })
        .where(eq(webhookDelivery.id, deliveryId));
      const claimed = await claimDueDeliveries({ limit: 1, ids: [deliveryId] });
      await processClaimed(claimed);
      const [after] = await db
        .select({
          status: webhookDelivery.status,
          lastError: webhookDelivery.lastError,
        })
        .from(webhookDelivery)
        .where(eq(webhookDelivery.id, deliveryId))
        .limit(1);

      return {
        audit: {
          targetType: "webhook_delivery",
          targetId: deliveryId,
          subjectUserId: row.ownerId,
          metadata: {
            event: row.event,
            endpointId: row.endpointId,
            from: row.status,
            to: after?.status ?? null,
          },
        },
        data: {
          status: after?.status ?? "pending",
          error: after?.lastError ?? null,
        },
      };
    },
  );
}

// ─── Imports ─────────────────────────────────────────────────────────────────

const importSchema = userReason.extend({ jobId: adminId });

/**
 * Rewrites one job in the user's import store, keeping every other entry
 * exactly as stored (even ones this version can't read).
 */
async function updateImportJob(
  userId: string,
  jobId: string,
  change: (job: ImportJob) => ImportJob,
): Promise<{ before: ImportJob; after: ImportJob }> {
  const [row] = await db
    .select({ id: integration.id, metadata: integration.metadata })
    .from(integration)
    .where(
      and(
        eq(integration.userId, userId),
        eq(integration.provider, JOB_STORE_PROVIDER),
      ),
    )
    .limit(1);
  const store = jobStoreSchema.safeParse(row?.metadata);
  if (!(row && store.success)) throw adminError("Import not found", 404);

  const index = store.data.jobs.findIndex(
    (entry) => (entry as { id?: unknown })?.id === jobId,
  );
  const parsed = importJobSchema.safeParse(store.data.jobs[index]);
  if (index === -1 || !parsed.success) {
    throw adminError("Import not found", 404);
  }
  const before = parsed.data;
  const after = change(before);
  const jobs = [...store.data.jobs];
  jobs[index] = after;
  await db
    .update(integration)
    .set({ metadata: { ...store.data, jobs }, updatedAt: new Date() })
    .where(eq(integration.id, row.id));
  return { before, after };
}

const importAudit = (
  userId: string,
  jobId: string,
  before: ImportJob,
  after: ImportJob,
) => ({
  audit: {
    targetType: "import_job",
    targetId: jobId,
    subjectUserId: userId,
    metadata: {
      provider: before.provider,
      fromStatus: before.status,
      toStatus: after.status,
      failedBefore: before.items.filter((item) => item.status === "failed")
        .length,
      pendingAfter: after.items.filter((item) => item.status === "pending")
        .length,
    },
  },
});

/**
 * Puts the failed links of an import back in the queue. The import itself
 * runs from the user's browser (it needs their provider connection), so the
 * user's import dialog resumes it next time they open it.
 */
export async function requeueImportAction(
  input: z.input<typeof importSchema>,
): Promise<AdminActionResult> {
  return runAdminAction(
    { action: "import_job.requeue", schema: importSchema },
    input,
    async (_admin, { userId, jobId }) => {
      const now = new Date();
      const { before, after } = await updateImportJob(userId, jobId, (job) => {
        const failed = job.items.some((item) => item.status === "failed");
        if (job.status === "running" && !isStuckImport(job, now)) {
          throw adminError("This import is still running. Wait for it.");
        }
        if (!(failed || job.status === "running")) {
          throw adminError("Nothing to re-run: no links failed.");
        }
        return requeueImportJob(job, now);
      });
      return importAudit(userId, jobId, before, after);
    },
  );
}

/** Stops a stuck import; links already created stay. */
export async function cancelImportAction(
  input: z.input<typeof importSchema>,
): Promise<AdminActionResult> {
  return runAdminAction(
    { action: "import_job.cancel", schema: importSchema },
    input,
    async (_admin, { userId, jobId }) => {
      const { before, after } = await updateImportJob(userId, jobId, (job) => {
        if (job.status !== "running") {
          throw adminError("This import already finished.");
        }
        return cancelImportJob(job, new Date());
      });
      return importAudit(userId, jobId, before, after);
    },
  );
}

// ─── Integrations ────────────────────────────────────────────────────────────

const integrationSchema = z.object({
  integrationId: adminId,
  reason: requiredReason,
});

/**
 * Same as the user's own Disconnect: revoke the token where the provider
 * allows it (best effort), clean up what the connection added, delete it.
 */
export async function disconnectIntegrationAction(
  input: z.input<typeof integrationSchema>,
): Promise<AdminActionResult> {
  return runAdminAction(
    { action: "integration.disconnect", schema: integrationSchema },
    input,
    async (_admin, { integrationId }) => {
      const [row] = await db
        .select({
          id: integration.id,
          userId: integration.userId,
          provider: integration.provider,
          status: integration.status,
        })
        .from(integration)
        .where(eq(integration.id, integrationId))
        .limit(1);
      if (!row) throw adminError("Integration not found", 404);
      if (row.provider === JOB_STORE_PROVIDER) {
        throw adminError("That row holds the user's import history.");
      }

      const revoked = await revokeStoredToken(row.userId, row.provider);
      await cleanupDataConnection(row.userId, row.provider).catch(
        (error: unknown) => {
          console.error(
            JSON.stringify({
              event: "admin.integration_cleanup_failed",
              provider: row.provider,
              error: error instanceof Error ? error.message : String(error),
            }),
          );
          return false;
        },
      );
      await db.delete(integration).where(eq(integration.id, row.id));
      return {
        audit: {
          targetType: "integration",
          targetId: row.id,
          subjectUserId: row.userId,
          metadata: {
            provider: row.provider,
            status: row.status,
            tokenRevoked: revoked,
          },
        },
      };
    },
  );
}

// ─── OAuth apps ──────────────────────────────────────────────────────────────

async function findApp(appId: string) {
  const [app] = await db
    .select({
      id: oauthApp.id,
      name: oauthApp.name,
      clientId: oauthApp.clientId,
      verified: oauthApp.verified,
      isActive: oauthApp.isActive,
      ownerUserId: oauthApp.ownerUserId,
    })
    .from(oauthApp)
    .where(eq(oauthApp.id, appId))
    .limit(1);
  if (!app) throw adminError("App not found", 404);
  return app;
}

const appAudit = (
  app: Awaited<ReturnType<typeof findApp>>,
  action: string,
) => ({
  audit: {
    action,
    targetType: "oauth_app",
    targetId: app.id,
    subjectUserId: app.ownerUserId,
    metadata: { name: app.name, clientId: app.clientId },
  },
});

const verifySchema = z.object({
  appId: adminId,
  verified: z.boolean(),
  reason: requiredReason,
});

/** The consent screen stops (or starts) showing the "unverified" note. */
export async function setOAuthAppVerifiedAction(
  input: z.input<typeof verifySchema>,
): Promise<AdminActionResult> {
  return runAdminAction(
    { action: "oauth_app.set_verified", schema: verifySchema },
    input,
    async (_admin, { appId, verified }) => {
      const app = await findApp(appId);
      if (!app.ownerUserId) {
        throw adminError("First-party apps are always trusted.");
      }
      if (app.verified === verified) return null;
      await db
        .update(oauthApp)
        .set({ verified, updatedAt: new Date() })
        .where(eq(oauthApp.id, appId));
      return appAudit(
        app,
        verified ? "oauth_app.verify" : "oauth_app.unverify",
      );
    },
  );
}

const suspendSchema = z.object({
  appId: adminId,
  suspended: z.boolean(),
  reason: requiredReason,
});

/**
 * Suspending turns the app off (no new authorizations; its tokens stop
 * working) and the owner can't turn it back on: setOAuthAppActive checks the
 * latest suspend / unsuspend entry in the audit log.
 */
export async function setOAuthAppSuspendedAction(
  input: z.input<typeof suspendSchema>,
): Promise<AdminActionResult> {
  return runAdminAction(
    { action: "oauth_app.set_suspended", schema: suspendSchema },
    input,
    async (_admin, { appId, suspended }) => {
      const app = await findApp(appId);
      await db
        .update(oauthApp)
        .set({ isActive: !suspended, updatedAt: new Date() })
        .where(eq(oauthApp.id, appId));
      return appAudit(
        app,
        suspended ? "oauth_app.suspend" : "oauth_app.unsuspend",
      );
    },
  );
}

// ─── Teams ───────────────────────────────────────────────────────────────────

const invitationSchema = z.object({
  invitationId: adminId,
  reason: requiredReason,
});

/**
 * Sends a pending invitation's email again, with a fresh 48 hours when it
 * has expired or is about to. Outside production no email is sent; the
 * invite link (/invite/<id>) works either way.
 */
export async function resendInvitationAction(
  input: z.input<typeof invitationSchema>,
): Promise<AdminActionResult<{ emailed: boolean; expiresAt: string }>> {
  return runAdminAction(
    { action: "invitation.resend", schema: invitationSchema },
    input,
    async (_admin, { invitationId }) => {
      const [row] = await db
        .select({
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          status: invitation.status,
          expiresAt: invitation.expiresAt,
          organizationId: invitation.organizationId,
          inviterId: invitation.inviterId,
          teamName: organization.name,
        })
        .from(invitation)
        .innerJoin(organization, eq(organization.id, invitation.organizationId))
        .where(eq(invitation.id, invitationId))
        .limit(1);
      if (!row) throw adminError("Invitation not found", 404);
      if (row.status !== "pending") {
        throw adminError(`This invitation is ${row.status}.`);
      }

      const expiresAt = resentInvitationExpiry(row.expiresAt, new Date());
      if (expiresAt.getTime() !== row.expiresAt.getTime()) {
        await db
          .update(invitation)
          .set({ expiresAt })
          .where(eq(invitation.id, invitationId));
      }
      const { sendTeamInviteEmail } = await import("@/lib/events/emails");
      const emailed = await sendTeamInviteEmail({
        id: row.id,
        email: row.email,
        role: row.role ?? "member",
        expiresAt,
        organizationId: row.organizationId,
        inviterId: row.inviterId,
      });
      return {
        audit: {
          targetType: "invitation",
          targetId: row.id,
          subjectUserId: row.inviterId,
          metadata: {
            targetEmail: row.email,
            organizationId: row.organizationId,
            teamName: row.teamName,
            emailed,
            expiresAt: expiresAt.toISOString(),
          },
        },
        data: { emailed, expiresAt: expiresAt.toISOString() },
      };
    },
  );
}

// ─── Delete account ──────────────────────────────────────────────────────────

const deleteSchema = userReason.extend({
  confirmation: z.string().trim().max(320),
});

/**
 * Deletes the account with the same plan as the user's own deletion
 * (lib/account): team content goes to a remaining member, teams with nobody
 * else go, files and domains are cleaned up. Support-specific rules: never
 * yourself or another admin, the email must be typed back, and a paying
 * user's subscription must be cancelled in Polar first (billing is changed
 * there, never here).
 */
export async function deleteUserAccountAction(
  input: z.input<typeof deleteSchema>,
): Promise<AdminActionResult> {
  return runAdminAction(
    { action: "user.delete", schema: deleteSchema, limit: "sensitive" },
    input,
    async (admin, { userId, confirmation }) => {
      if (userId === admin.id) {
        throw adminError("Delete your own account from Settings → Account.");
      }
      const [target] = await db
        .select({ id: user.id, email: user.email, role: user.role })
        .from(user)
        .where(eq(user.id, userId))
        .limit(1);
      if (!target) throw adminError("User not found", 404);
      if (!confirmsEmail(confirmation, target.email)) {
        throw adminError("Type the user's email exactly to confirm.");
      }
      if (hasAdminRole(target.role)) {
        throw adminError("Remove their admin role first.");
      }

      const {
        AccountDeletionError,
        executeAccountDeletion,
        loadDeletionFacts,
      } = await import("@/lib/account/deletion-server");
      const { planAccountDeletion } = await import("@/lib/account/deletion");

      let plan = planAccountDeletion(await loadDeletionFacts(userId));
      if (plan.subscription) {
        throw adminError(
          `They have an active ${plan.subscription.planName} subscription. Cancel it in Polar first, then delete the account.`,
        );
      }
      if (plan.blockers.length > 0) throw adminError(plan.blockers[0]);

      // The plan promotes through the organization plugin as the account
      // owner; an admin isn't a member, so promote directly, then re-plan.
      const promoted = plan.teams.flatMap((team) =>
        team.action === "hand-over" && team.promote
          ? [{ organizationId: team.organizationId, ...team.successor }]
          : [],
      );
      for (const team of promoted) {
        await db
          .update(member)
          .set({ role: "owner" })
          .where(eq(member.id, team.memberId));
      }
      if (promoted.length > 0) {
        plan = planAccountDeletion(await loadDeletionFacts(userId));
      }
      const emptyTeams = plan.teams.flatMap((team) =>
        team.action === "delete-team" ? [team.organizationId] : [],
      );

      try {
        await executeAccountDeletion({
          userId,
          plan,
          requestHeaders: await headers(),
        });
      } catch (error) {
        if (error instanceof AccountDeletionError) {
          throw adminError(`Deletion stopped: ${error.message}`);
        }
        throw error;
      }

      // Teams only they were in (the plugin call above needs a member's
      // session): delete those left without members.
      for (const organizationId of emptyTeams) {
        const [left] = await db
          .select({ total: count() })
          .from(member)
          .where(eq(member.organizationId, organizationId));
        if ((left?.total ?? 0) === 0) {
          await db
            .delete(organization)
            .where(eq(organization.id, organizationId));
          scheduleWorkspaceAuditCleanup(organizationId);
        }
      }

      return {
        audit: {
          targetType: "user",
          targetId: userId,
          subjectUserId: userId,
          metadata: {
            targetEmail: target.email,
            handedOver: plan.teams
              .filter((team) => team.action === "hand-over")
              .map((team) => team.organizationId),
            promoted: promoted.map((team) => ({
              organizationId: team.organizationId,
              userId: team.userId,
            })),
            deletedTeams: emptyTeams,
            personal: plan.personal,
          },
        },
      };
    },
  );
}
