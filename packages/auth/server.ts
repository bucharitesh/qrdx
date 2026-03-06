import * as schema from "@repo/database";
import { database as db } from "@repo/database";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { lastLoginMethod } from "better-auth/plugins";
import { keys } from "@/keys";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  socialProviders: {
    github: {
      clientId: keys().GITHUB_CLIENT_ID,
      clientSecret: keys().GITHUB_CLIENT_SECRET,
    },
    google: {
      clientId: keys().GOOGLE_CLIENT_ID,
      clientSecret: keys().GOOGLE_CLIENT_SECRET,
    },
  },
  plugins: [lastLoginMethod()],
  rateLimit: {
    window: 10, // time window in seconds
    max: 10, // max requests in the window
  },
}) as any;
