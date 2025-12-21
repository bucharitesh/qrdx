import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    // Database
    DATABASE_URL: z.url().min(1),

    // Auth - GitHub
    GITHUB_APP_ID: z.string(),
    GITHUB_CLIENT_ID: z.string().min(1),
    GITHUB_CLIENT_SECRET: z.string().min(1),

    // Auth - Google
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),

    // AI Provider - Google
    GOOGLE_API_KEY: z.string().min(1),

    // Payments - Polar
    POLAR_ACCESS_TOKEN: z.string().min(1),
    POLAR_WEBHOOK_SECRET: z.string().min(1),

    // Integrations - Dub
    DUB_CLIENT_ID: z.string().min(1),
    DUB_CLIENT_SECRET: z.string().min(1),
    DUB_REDIRECT_URI: z.url().min(1),

    // Integrations - Google Drive
    GOOGLE_DRIVE_REDIRECT_URI: z.url().optional(),

    // Integration encryption
    INTEGRATION_ENCRYPTION_KEY: z.string().min(32),

    // Standard Node.js environment
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  },
  client: {
    NEXT_PUBLIC_FEATUREBASE_APP_ID: z.string().min(1),
    NEXT_PUBLIC_POSTHOG_KEY: z.string().min(1),
    NEXT_PUBLIC_POSTHOG_HOST: z.url().min(1),
    NEXT_PUBLIC_QRDX_PRO_MONTHLY_PRODUCT_ID: z.string().min(1),
    NEXT_PUBLIC_QRDX_PRO_YEARLY_PRODUCT_ID: z.string().min(1),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    GITHUB_APP_ID: process.env.GITHUB_APP_ID,
    GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
    POLAR_ACCESS_TOKEN: process.env.POLAR_ACCESS_TOKEN,
    POLAR_WEBHOOK_SECRET: process.env.POLAR_WEBHOOK_SECRET,
    DUB_CLIENT_ID: process.env.DUB_CLIENT_ID,
    DUB_CLIENT_SECRET: process.env.DUB_CLIENT_SECRET,
    DUB_REDIRECT_URI: process.env.DUB_REDIRECT_URI,
    GOOGLE_DRIVE_REDIRECT_URI: process.env.GOOGLE_DRIVE_REDIRECT_URI,
    INTEGRATION_ENCRYPTION_KEY: process.env.INTEGRATION_ENCRYPTION_KEY,
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_FEATUREBASE_APP_ID: process.env.NEXT_PUBLIC_FEATUREBASE_APP_ID,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    NEXT_PUBLIC_QRDX_PRO_MONTHLY_PRODUCT_ID:
      process.env.NEXT_PUBLIC_QRDX_PRO_MONTHLY_PRODUCT_ID,
    NEXT_PUBLIC_QRDX_PRO_YEARLY_PRODUCT_ID:
      process.env.NEXT_PUBLIC_QRDX_PRO_YEARLY_PRODUCT_ID,
  },
});
