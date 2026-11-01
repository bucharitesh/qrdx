import * as schema from "@repo/database";
import { database as db } from "@repo/database";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import {
  admin,
  emailOTP,
  lastLoginMethod,
  organization,
} from "better-auth/plugins";
import { getAdminUserIds } from "./admin";
import { sendVerificationOTP } from "./email-otp";
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

// Email sign-in codes: request one, then sign in with it. Everything else the
// emailOTP plugin offers (verification, password reset, email change) is off.
const SEND_CODE_PATH = "/email-otp/send-verification-otp";
const SIGN_IN_CODE_PATH = "/sign-in/email-otp";
const UNUSED_EMAIL_OTP_PATHS = [
  "/email-otp/check-verification-otp",
  "/email-otp/verify-email",
  "/email-otp/request-password-reset",
  "/forget-password/email-otp",
  "/email-otp/reset-password",
  "/email-otp/request-email-change",
  "/email-otp/change-email",
];

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  socialProviders,
  // Codes live in the core `verification` table. The identifier holds the
  // address ("sign-in-otp-<email>"), so it is hashed like the code itself.
  verification: {
    storeIdentifier: {
      default: "plain",
      overrides: { "sign-in-otp-": "hashed" },
    },
  },
  databaseHooks: {
    user: {
      create: {
        // Email-code sign-ups arrive without a name; start with the address's
        // local part so invites and member lists never show a blank.
        before: (user) => {
          if (user.name?.trim()) return Promise.resolve();
          const name = user.email.split("@")[0] || user.email;
          return Promise.resolve({ data: { ...user, name } });
        },
      },
    },
  },
  hooks: {
    // Only sign-in codes can be requested (the plugin also accepts
    // verification and password-reset types, which QRdx doesn't use).
    before: createAuthMiddleware((ctx) => {
      if (ctx.path === SEND_CODE_PATH && ctx.body?.type !== "sign-in") {
        return Promise.reject(
          new APIError("BAD_REQUEST", { message: "Invalid code type" })
        );
      }
      return Promise.resolve();
    }),
  },
  plugins: [
    lastLoginMethod({
      // The plugin doesn't name email-code sign-ins itself; null falls back to
      // its own detection (Google, GitHub).
      customResolveMethod: (ctx) =>
        ctx.path === SIGN_IN_CODE_PATH ? "email-otp" : null,
    }),
    // A first sign-in creates the account, like social sign-in.
    emailOTP({
      otpLength: 6,
      expiresIn: 5 * 60,
      allowedAttempts: 3,
      storeOTP: "hashed",
      disableSignUp: false,
      sendVerificationOTP,
    }),
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
  disabledPaths: [
    "/admin/impersonate-user",
    "/admin/set-user-password",
    ...UNUSED_EMAIL_OTP_PATHS,
  ],
  // Better Auth enforces these in production only, per IP, in memory.
  rateLimit: {
    window: 10, // time window in seconds
    max: 10, // max requests in the window
    customRules: {
      // Every page load and tab focus reads the session; a strict limit made
      // fast browsing (several tabs, quick navigation) look signed out with
      // 429s. It's a cheap read of the visitor's own cookie, so allow plenty.
      "/get-session": { window: 10, max: 100 },
      // Each request emails someone: 3 a minute (the dialog waits 30 s between resends).
      [SEND_CODE_PATH]: { window: 60, max: 3 },
      // Each code allows 3 tries, so 5 a minute leaves room for one resend.
      [SIGN_IN_CODE_PATH]: { window: 60, max: 5 },
    },
  },
}) as any;
