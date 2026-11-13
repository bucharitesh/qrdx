import { onValidationError } from "@repo/next-config/env-errors";
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const keys = () =>
  createEnv({
    server: {
      // Signs sessions and cookies (Better Auth reads it itself)
      BETTER_AUTH_SECRET: z.string().min(1),
      // Public URL for OAuth callbacks and passkeys; defaults to the app URL
      BETTER_AUTH_URL: z.url().optional(),
      // Social sign-in: each provider is enabled when both its values are set
      // (Google's are also used by the Google Drive and Sheets integrations)
      GITHUB_CLIENT_ID: z.string().min(1).optional(),
      GITHUB_CLIENT_SECRET: z.string().min(1).optional(),
      GOOGLE_CLIENT_ID: z.string().min(1).optional(),
      GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
      // Comma-separated bootstrap admins for the /admin panel
      ADMIN_EMAILS: z.string().optional(),
      ADMIN_USER_IDS: z.string().optional(),
      // Licence key for the ee/ features (workspace SSO, the audit log):
      // any non-empty value turns them on (./ee-license.ts)
      QRDX_EE_LICENSE: z.string().min(1).optional(),
    },
    client: {},
    runtimeEnv: {
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
      GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
      GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
      ADMIN_EMAILS: process.env.ADMIN_EMAILS,
      ADMIN_USER_IDS: process.env.ADMIN_USER_IDS,
      QRDX_EE_LICENSE: process.env.QRDX_EE_LICENSE,
    },
    emptyStringAsUndefined: true,
    onValidationError,
  });
