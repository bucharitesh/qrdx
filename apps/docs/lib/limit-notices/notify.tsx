import "server-only";

import { isOwnWorkspaceOf } from "@repo/auth/own-workspace-id";
import {
  database as db,
  limitNotice,
  member,
  organization,
  user,
} from "@repo/database";
import cuid from "cuid";
import { and, eq, inArray, like } from "drizzle-orm";
import { limitCopy } from "@/app/settings/usage/_lib/limit-copy";
import {
  type Meter,
  meterLabel,
  resolveMeterCaps,
} from "@/app/settings/usage/_lib/meters";
import { getCheckoutOpen } from "@/lib/checkout-availability";
import { isMissingSchemaError } from "@/lib/community/tables";
import { sendEmail } from "@/lib/email/send";
import { LimitNoticeEmail } from "@/lib/email/templates/limit-notice";
import { baseUrl } from "@/lib/metadata";
import { PLAN_LIMITS } from "@/lib/plans";
import { PLAN_NAMES } from "@/lib/pricing";
import { workspaceHref } from "@/lib/workspace-paths";
import { strongestRole } from "@/lib/workspaces";
import type { KnownUsage, LimitScope } from "./index";
import {
  NOTICE_WORDS,
  type NoticeLimitId,
  type NoticeThreshold,
  noticeKey,
  noticePeriod,
  noticeSubject,
  reachedThresholds,
} from "./levels";
import { type LimitUsage, readLimitUsage } from "./usage";

function log(event: string, fields: Record<string, unknown>) {
  console.info(JSON.stringify({ event, ...fields }));
}

let missingLogged = false;

interface Claim {
  organizationId: string;
  limitId: NoticeLimitId;
  subject: string;
  period: string;
}

/**
 * Records the thresholds as sent and returns the ones this call recorded
 * (another request may have won the race). null when limit_notice isn't
 * there yet (manual-sql/0015): then nothing is sent.
 */
export async function claimThresholds(
  claim: Claim,
  thresholds: NoticeThreshold[],
): Promise<NoticeThreshold[] | null> {
  try {
    const rows = await db
      .insert(limitNotice)
      .values(
        thresholds.map((threshold) => ({ id: cuid(), ...claim, threshold })),
      )
      .onConflictDoNothing()
      .returning({ threshold: limitNotice.threshold });
    return rows.map((row) => row.threshold as NoticeThreshold);
  } catch (error) {
    if (isMissingSchemaError(error)) {
      if (!missingLogged) {
        missingLogged = true;
        log("limit_notice.unavailable", {
          hint: "Apply packages/database/manual-sql/0015_limit_notices.sql",
        });
      }
      return null;
    }
    throw error;
  }
}

/** Undoes a claim whose email didn't go out, so a later write tries again. */
async function releaseThreshold(claim: Claim, threshold: NoticeThreshold) {
  await db
    .delete(limitNotice)
    .where(
      and(
        eq(limitNotice.organizationId, claim.organizationId),
        eq(limitNotice.limitId, claim.limitId),
        eq(limitNotice.subject, claim.subject),
        eq(limitNotice.period, claim.period),
        eq(limitNotice.threshold, threshold),
      ),
    );
}

interface Recipient {
  email: string;
}

/** The workspace's owners (a personal workspace's owner is its person). */
async function ownerEmails(organizationId: string): Promise<Recipient[]> {
  const owners = await db
    .select({ userId: member.userId, role: member.role })
    .from(member)
    .where(
      and(
        eq(member.organizationId, organizationId),
        like(member.role, "%owner%"),
      ),
    );
  const ids = owners
    .filter((row) => strongestRole(row.role) === "owner")
    .map((row) => row.userId);
  return emailsOf(ids);
}

async function emailsOf(userIds: string[]): Promise<Recipient[]> {
  if (userIds.length === 0) return [];
  const rows = await db
    .select({ email: user.email, banned: user.banned })
    .from(user)
    .where(inArray(user.id, userIds));
  return rows
    .filter((row) => !row.banned && row.email)
    .map((row) => ({ email: row.email }));
}

async function workspaceInfo(organizationId: string) {
  const [row] = await db
    .select({ name: organization.name, slug: organization.slug })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);
  return row ?? null;
}

const absolute = (path: string) => new URL(path, baseUrl.origin).toString();

/** The meter Plan & usage would show, as limit-copy.ts takes it. */
function toMeter(id: NoticeLimitId, usage: LimitUsage): Meter {
  return {
    id,
    label: meterLabel(id),
    used: usage.used,
    limit: usage.limit,
    unit: id === "storage" ? "bytes" : "count",
    ...(usage.resetsAt ? { resetsAt: usage.resetsAt } : {}),
  };
}

export interface NoticeOutcome {
  sent: NoticeThreshold | null;
  reason?:
    | "under"
    | "already"
    | "unavailable"
    | "no-recipients"
    | "no-workspace"
    | "failed";
}

/**
 * Emails the owners once when the workspace reaches 90% and once at 100%
 * of `limitId` this month. Callers go through noteLimitUsage (./index.ts),
 * which only runs this where email can go out.
 */
export async function sendLimitNotice(
  scope: LimitScope,
  limitId: NoticeLimitId,
  known?: KnownUsage,
  now: Date = new Date(),
): Promise<NoticeOutcome> {
  const usage = await readLimitUsage(scope, limitId, known);
  const thresholds = usage ? reachedThresholds(usage.used, usage.limit) : [];
  if (!usage || thresholds.length === 0) return { sent: null, reason: "under" };
  const top = thresholds.at(-1) as NoticeThreshold;

  // AI art counted per person is that person's notice; everything else is
  // the workspace's.
  const perPerson = limitId === "aiArt" && !usage.pooled;
  const claim: Claim = {
    organizationId: scope.organizationId,
    limitId,
    subject: perPerson ? scope.userId : "",
    period: noticePeriod(now),
  };
  const claimed = await claimThresholds(claim, thresholds);
  if (claimed === null) return { sent: null, reason: "unavailable" };
  if (!claimed.includes(top)) return { sent: null, reason: "already" };

  const [workspace, recipients] = await Promise.all([
    workspaceInfo(scope.organizationId),
    perPerson ? emailsOf([scope.userId]) : ownerEmails(scope.organizationId),
  ]);
  if (!workspace) return { sent: null, reason: "no-workspace" };
  if (recipients.length === 0) return { sent: null, reason: "no-recipients" };

  const own = isOwnWorkspaceOf(scope.organizationId, scope.userId);
  const meter = toMeter(limitId, usage);
  const copy = limitCopy(meter, {
    plan: usage.plan,
    canUpgrade: !perPerson,
    checkoutOpen: getCheckoutOpen(),
    cap: resolveMeterCaps(PLAN_LIMITS, usage.plan, { isTeam: !own })[limitId],
  });
  if (!copy) return { sent: null, reason: "under" };

  const words = NOTICE_WORDS[limitId];
  const level = top === 100 ? "full" : "near";
  const email = (
    <LimitNoticeEmail
      level={level}
      limitLabel={words.label}
      noun={words.noun}
      planName={PLAN_NAMES[usage.plan]}
      reason={copy.reason}
      recipientReason={
        perPerson
          ? `You get this because you made AI art in ${workspace.name} on QRdx. The allowance is counted for you.`
          : `You get this because you're an owner of ${workspace.name} on QRdx.`
      }
      usageUrl={absolute(workspaceHref(workspace.slug, "/settings/usage"))}
      value={copy.value}
      workspaceName={workspace.name}
    />
  );

  const result = await sendEmail({
    to: recipients.map((recipient) => recipient.email),
    subject: noticeSubject(limitId, top, {
      value: copy.value,
      workspace: workspace.name,
    }),
    react: email,
    idempotencyKey: noticeKey({ ...claim, threshold: top }),
    tags: [
      { name: "type", value: "limit_notice" },
      { name: "limit", value: limitId },
    ],
  });
  if (!result.sent) {
    // Not sent: free the claim so the next write tries again.
    await releaseThreshold(claim, top).catch(() => {});
    log("limit_notice.not_sent", { limit: limitId, threshold: top });
    return { sent: null, reason: "failed" };
  }
  log("limit_notice.sent", {
    limit: limitId,
    threshold: top,
    recipients: recipients.length,
  });
  return { sent: top };
}
