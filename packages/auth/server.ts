import { passkey } from "@better-auth/passkey";
import { sso } from "@better-auth/sso";
import * as schema from "@repo/database";
import { database as db } from "@repo/database";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from "better-auth/api";
import {
  admin,
  emailOTP,
  lastLoginMethod,
  organization,
  twoFactor,
} from "better-auth/plugins";
import {
  defaultRoles,
  memberAc,
} from "better-auth/plugins/organization/access";
import { getAdminUserIds } from "./admin";
import { sendVerificationOTP } from "./email-otp";
import { keys } from "./keys";
import {
  ENTITLED_SUBSCRIPTION_STATUSES,
  hasEntitledSubscription,
} from "./plan";
import { signInChallenge } from "./sign-in-challenge";
import {
  BACKUP_CODE_COUNT,
  SERVER_ONLY_TWO_FACTOR_PATHS,
  TOTP_DIGITS,
  TOTP_PERIOD_SECONDS,
  TRUST_DEVICE_DAYS,
  UNUSED_TWO_FACTOR_PATHS,
} from "./sign-in-challenge-rules";
import {
  assertDeletable,
  assertNotOwnMember,
  assertWorkspaceSlug,
  createOwnWorkspace,
  handRowsBackToCreators,
  initialWorkspaceId,
} from "./workspace-hooks";

// Members per team, owner included, by the best plan among its owners and
// billing members (the roles that pay, PLAN_ROLES in apps/docs/lib/
// permissions.ts). Keep in sync with `teamMembers` and
// getOwnerPlanForOrganization in apps/docs/lib/plans.ts. Business products
// are the env ids; any other entitled product counts as Pro
// (planForSubscriptionProduct).
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

const PLAN_ROLES = new Set(["owner", "billing"]);

async function teamMemberLimit(organizationId: string): Promise<number> {
  const owners = await db.query.member.findMany({
    columns: { userId: true, role: true },
    where: (table, { and, eq, like, or }) =>
      and(
        eq(table.organizationId, organizationId),
        or(like(table.role, "%owner%"), like(table.role, "%billing%"))
      ),
  });
  const ownerIds = owners
    .filter((m) =>
      m.role.split(",").some((role) => PLAN_ROLES.has(role.trim()))
    )
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

// Email sign-in codes: request one, then sign in with it. Verification and
// password reset, which the emailOTP plugin also offers, are off.
const SEND_CODE_PATH = "/email-otp/send-verification-otp";
const SIGN_IN_CODE_PATH = "/sign-in/email-otp";
const UNUSED_EMAIL_OTP_PATHS = [
  "/email-otp/check-verification-otp",
  "/email-otp/verify-email",
  "/email-otp/request-password-reset",
  "/forget-password/email-otp",
  "/email-otp/reset-password",
];
// Email change is on, but never over HTTP: only the app's server actions call
// it, through auth.api (apps/docs/app/settings/account/_lib/
// email-change-actions.ts). They add what the plugin doesn't: a recent
// sign-in, per-user limits and the notice to the old address, so a direct
// request can't skip them.
const SERVER_ONLY_EMAIL_OTP_PATHS = [
  "/email-otp/request-email-change",
  "/email-otp/change-email",
];

// Two-step verification (Lane A). An authenticator app plus backup codes;
// no codes by email or SMS as a second factor, so the plugin's OTP endpoints
// are off. Turning it on or off and new backup codes only go through the
// app's server actions (apps/docs/app/settings/account/_lib/
// two-factor-actions.ts), which add a recent sign-in, a current code, limits
// and the notice email. Over HTTP only the challenge's own endpoints remain.
const twoFactorPlugin = twoFactor({
  issuer: "QRdx",
  // QRdx has no passwords; the app's actions check a code instead.
  allowPasswordless: true,
  // The issuer is read from here by get-totp-uri, from above by enable.
  totpOptions: {
    issuer: "QRdx",
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD_SECONDS,
  },
  backupCodeOptions: {
    amount: BACKUP_CODE_COUNT,
    storeBackupCodes: "encrypted",
  },
  trustDeviceMaxAge: TRUST_DEVICE_DAYS * 24 * 60 * 60,
});

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  socialProviders,
  account: {
    accountLinking: {
      // Email codes always work for the account's address, so removing the
      // last Google or GitHub link never locks anyone out.
      allowUnlinkingAll: true,
    },
  },
  // Codes live in the core `verification` table. Identifiers hold addresses
  // ("sign-in-otp-<email>", "change-email-otp-<old>-<new>"), so they are
  // hashed like the codes themselves.
  verification: {
    storeIdentifier: {
      default: "plain",
      overrides: { "sign-in-otp-": "hashed", "change-email-otp-": "hashed" },
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
        // Every account gets a workspace of its own straight away. If this
        // fails, the first dashboard visit makes it (apps/docs/lib/workspaces.ts).
        after: async (user) => {
          try {
            await createOwnWorkspace(user);
          } catch (error) {
            console.error("Could not create the new user's workspace", error);
          }
        },
      },
    },
    session: {
      create: {
        // Sign-in opens the workspace last opened anywhere, else your own.
        before: async (session) => {
          if (session.activeOrganizationId) return;
          try {
            const activeOrganizationId = await initialWorkspaceId(
              session.userId
            );
            if (activeOrganizationId) {
              return { data: { ...session, activeOrganizationId } };
            }
          } catch (error) {
            console.error("Could not pick the session's workspace", error);
          }
        },
      },
    },
  },
  hooks: {
    // Only sign-in codes can be requested (the plugin also accepts
    // verification and password-reset types, which QRdx doesn't use).
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === SEND_CODE_PATH && ctx.body?.type !== "sign-in") {
        throw new APIError("BAD_REQUEST", { message: "Invalid code type" });
      }
      // Leaving doesn't run the plugin's member hooks, so it's checked here.
      if (ctx.path === "/organization/leave") {
        const session = await getSessionFromCtx(ctx);
        const organizationId = ctx.body?.organizationId;
        if (session && typeof organizationId === "string") {
          assertNotOwnMember(
            organizationId,
            session.user.id,
            "You can't leave your own workspace."
          );
        }
      }
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
      // The code goes to the new address; the app requires a recent sign-in
      // instead of a second code to the current one (see above).
      changeEmail: { enabled: true },
      sendVerificationOTP,
    }),
    admin({ adminUserIds: getAdminUserIds() }),
    // Workspaces. Everyone has their own (made at sign-up, above); Pro and
    // Business users can create more (any entitled subscription, ./plan.ts).
    organization({
      creatorRole: "owner",
      // QRdx's five roles (apps/docs/lib/permissions.ts decides what each
      // may do in the app). Viewer and billing get the plugin's member
      // statements: neither manages the workspace or its people through
      // the plugin. Registering them lets invitations and role changes use
      // them (the plugin refuses roles it doesn't know).
      roles: { ...defaultRoles, viewer: memberAc, billing: memberAc },
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
      // Workspace URLs and everyone's own workspace (./workspace-hooks.ts).
      organizationHooks: {
        beforeCreateOrganization: ({ organization: org }) => {
          assertWorkspaceSlug(org.slug);
          return Promise.resolve();
        },
        beforeUpdateOrganization: ({ organization: org }) => {
          assertWorkspaceSlug(org.slug);
          return Promise.resolve();
        },
        beforeDeleteOrganization: async ({ organization: org }) => {
          await assertDeletable(org.id);
          await handRowsBackToCreators(org.id);
        },
        beforeRemoveMember: ({ member, organization: org }) => {
          assertNotOwnMember(
            org.id,
            member.userId,
            "Nobody can be removed from their own workspace."
          );
          return Promise.resolve();
        },
        beforeUpdateMemberRole: ({ member, newRole, organization: org }) => {
          if (!newRole.split(",").some((role) => role.trim() === "owner")) {
            assertNotOwnMember(
              org.id,
              member.userId,
              "The person whose own workspace this is stays an owner."
            );
          }
          return Promise.resolve();
        },
      },
    }),
    // Sign-in security (packages/database/manual-sql/0017).
    // Two-step verification (Lane A): the plugin, then the challenge after
    // every session-creating endpoint (./sign-in-challenge.ts).
    twoFactorPlugin,
    signInChallenge(twoFactorPlugin),
    passkey({ rpName: "QRdx" }),
    sso({ domainVerification: { enabled: true } }),
  ],
  // The admin panel does not use impersonation or password resets; keep them off the HTTP surface.
  disabledPaths: [
    "/admin/impersonate-user",
    "/admin/set-user-password",
    ...UNUSED_EMAIL_OTP_PATHS,
    ...SERVER_ONLY_EMAIL_OTP_PATHS,
    // Two-step verification (Lane A)
    ...UNUSED_TWO_FACTOR_PATHS,
    ...SERVER_ONLY_TWO_FACTOR_PATHS,
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
      // Two-step verification (Lane A): the plugin's own 3 per 10 s, stated
      // here. Each challenge also allows 5 wrong codes, and 10 in a row lock
      // the account for 15 minutes.
      "/two-factor/verify-totp": { window: 10, max: 3 },
      "/two-factor/verify-backup-code": { window: 10, max: 3 },
    },
  },
}) as any;
