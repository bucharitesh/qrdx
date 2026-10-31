import * as schema from "@repo/database";
import { database as db } from "@repo/database";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, lastLoginMethod } from "better-auth/plugins";
import { getAdminUserIds } from "./admin";
import { keys } from "./keys";

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
  plugins: [lastLoginMethod(), admin({ adminUserIds: getAdminUserIds() })],
  // The admin panel does not use impersonation or password resets; keep them off the HTTP surface.
  disabledPaths: ["/admin/impersonate-user", "/admin/set-user-password"],
  rateLimit: {
    window: 10, // time window in seconds
    max: 10, // max requests in the window
  },
}) as any;
