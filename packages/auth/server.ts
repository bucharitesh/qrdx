import * as schema from "@repo/database";
import { database as db } from "@repo/database";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, lastLoginMethod, organization } from "better-auth/plugins";
import { getAdminUserIds } from "./admin";
import { keys } from "./keys";
import {
  ENTITLED_SUBSCRIPTION_STATUSES,
  hasEntitledSubscription,
} from "./plan";

// Members per team, owner included, by the best plan among its owners. Keep in
// sync with `teamMembers` in apps/docs/lib/plans.ts. Business products are the
// env ids; any other entitled product counts as Pro (planForSubscriptionProduct).
const TEAM_MEMBER_LIMITS = {
  free: 1,
  pro: 3,
  business: Number.POSITIVE_INFINITY,
};
const BUSINESS_PRODUCT_IDS = new Set(
  [
    process.env.NEXT_PUBLIC_QRDX_BUSINESS_MONTHLY_PRODUCT_ID,
    process.env.NEXT_PUBLIC_QRDX_BUSINESS_YEARLY_PRODUCT_ID,
  ].filter(Boolean)
);
// Better Auth's default invitation cap, kept for teams without a member limit.
const MAX_PENDING_INVITATIONS = 100;

async function teamMemberLimit(organizationId: string): Promise<number> {
  const owners = await db.query.member.findMany({
    columns: { userId: true, role: true },
    where: (table, { and, eq, like }) =>
      and(
        eq(table.organizationId, organizationId),
        like(table.role, "%owner%")
      ),
  });
  const ownerIds = owners
    .filter((m) => m.role.split(",").some((role) => role.trim() === "owner"))
    .map((m) => m.userId);
  if (ownerIds.length === 0) return TEAM_MEMBER_LIMITS.free;

  const subscriptions = await db.query.subscription.findMany({
    columns: { productId: true },
    where: (table, { and, inArray }) =>
      and(
        inArray(table.userId, ownerIds),
        inArray(table.status, ENTITLED_SUBSCRIPTION_STATUSES)
      ),
  });
  if (subscriptions.length === 0) return TEAM_MEMBER_LIMITS.free;
  return subscriptions.some((s) => BUSINESS_PRODUCT_IDS.has(s.productId))
    ? TEAM_MEMBER_LIMITS.business
    : TEAM_MEMBER_LIMITS.pro;
}

/** Pending invitations allowed: the seats left after current members. */
async function teamInvitationLimit(organizationId: string): Promise<number> {
  const limit = await teamMemberLimit(organizationId);
  if (!Number.isFinite(limit)) return MAX_PENDING_INVITATIONS;
  const members = await db.query.member.findMany({
    columns: { id: true },
    where: (table, { eq }) => eq(table.organizationId, organizationId),
  });
  return Math.max(0, limit - members.length);
}

const {
  GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
} = keys();

// Only providers with both a client id and secret are offered.
const socialProviders: BetterAuthOptions["socialProviders"] = {
  ...(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET
    ? {
        github: {
          clientId: GITHUB_CLIENT_ID,
          clientSecret: GITHUB_CLIENT_SECRET,
        },
      }
    : {}),
  ...(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET
    ? {
        google: {
          clientId: GOOGLE_CLIENT_ID,
          clientSecret: GOOGLE_CLIENT_SECRET,
        },
      }
    : {}),
};

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  socialProviders,
  plugins: [
    lastLoginMethod(),
    admin({ adminUserIds: getAdminUserIds() }),
    // Teams. Every member can use the team; Pro and Business users can create
    // one (any entitled subscription, see ./plan.ts).
    organization({
      creatorRole: "owner",
      allowUserToCreateOrganization: (user) => hasEntitledSubscription(user.id),
      // Seats follow the owners' plan: Pro 3, Business unlimited. Checked when
      // an invitation is accepted; pending invitations can't exceed free seats.
      membershipLimit: (_user, org) => teamMemberLimit(org.id),
      invitationLimit: ({ organization: org }) => teamInvitationLimit(org.id),
      // Invite emails are sent by apps/docs/actions/organizations.ts; the
      // copyable /invite/<id> link in the dashboard always works too.
      sendInvitationEmail: () => Promise.resolve(),
      // Invite links can be forwarded, so only the verified invitee may accept.
      requireEmailVerificationOnInvitation: true,
    }),
  ],
  // The admin panel does not use impersonation or password resets; keep them off the HTTP surface.
  disabledPaths: ["/admin/impersonate-user", "/admin/set-user-password"],
  rateLimit: {
    window: 10, // time window in seconds
    max: 10, // max requests in the window
  },
}) as any;
