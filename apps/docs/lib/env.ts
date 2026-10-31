import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    // Database
    DATABASE_URL: z.url().min(1),

    // Optional services: a missing value disables only that feature.

    // Docs feedback GitHub App
    GITHUB_APP_ID: z.string().optional(),

    // Auth - GitHub
    GITHUB_CLIENT_ID: z.string().min(1).optional(),
    GITHUB_CLIENT_SECRET: z.string().min(1).optional(),

    // Auth - Google (also used by the Google Drive integration)
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),

    // AI Provider - Google
    GOOGLE_API_KEY: z.string().min(1).optional(),

    // Payments - Polar
    POLAR_ACCESS_TOKEN: z.string().min(1).optional(),
    POLAR_WEBHOOK_SECRET: z.string().min(1).optional(),

    // Integrations - Dub
    DUB_CLIENT_ID: z.string().min(1).optional(),
    DUB_CLIENT_SECRET: z.string().min(1).optional(),
    DUB_REDIRECT_URI: z.url().min(1).optional(),

    // Integrations - Google Drive
    GOOGLE_DRIVE_REDIRECT_URI: z.url().optional(),

    // Integration encryption
    INTEGRATION_ENCRYPTION_KEY: z.string().min(32).optional(),

    // Dynamic QR scans: salt for visitor_hash (falls back to one derived from BETTER_AUTH_SECRET)
    SCAN_HASH_SALT: z.string().min(16).optional(),

    // Custom domains via the Vercel Domains API (feature off without token + project id)
    VERCEL_API_TOKEN: z.string().min(1).optional(),
    VERCEL_PROJECT_ID: z.string().min(1).optional(),
    VERCEL_TEAM_ID: z.string().min(1).optional(),

    // AI QR art (fal.ai)
    FAL_KEY: z.string().min(1).optional(),

    // File storage: Cloudflare R2 (feature hidden unless account, keys and bucket are set)
    R2_ACCOUNT_ID: z.string().min(1).optional(),
    R2_ACCESS_KEY_ID: z.string().min(1).optional(),
    R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    R2_BUCKET: z.string().min(1).optional(),
    // Public bucket URL or custom domain for served files (else presigned GETs)
    R2_PUBLIC_BASE_URL: z.url().optional(),

    // Email: Resend (emails are skipped and logged when unset)
    RESEND_API_KEY: z.string().min(1).optional(),
    // Sender, e.g. "QRdx <hello@qrdx.dev>"
    EMAIL_FROM: z.string().regex(/\S@\S/).optional(),

    // Google Web Risk lookups of destination URLs
    WEB_RISK_API_KEY: z.string().min(1).optional(),

    // Cloudflare Turnstile verification (pairs with NEXT_PUBLIC_TURNSTILE_SITE_KEY)
    TURNSTILE_SECRET_KEY: z.string().min(1).optional(),

    // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` (webhook retries, digests)
    CRON_SECRET: z.string().min(16).optional(),

    // Standard Node.js environment
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  },
  client: {
    NEXT_PUBLIC_FEATUREBASE_APP_ID: z.string().min(1).optional(),
    NEXT_PUBLIC_POSTHOG_KEY: z.string().min(1).optional(),
    NEXT_PUBLIC_POSTHOG_HOST: z.url().min(1).optional(),
    NEXT_PUBLIC_QRDX_PRO_MONTHLY_PRODUCT_ID: z.string().min(1).optional(),
    NEXT_PUBLIC_QRDX_PRO_YEARLY_PRODUCT_ID: z.string().min(1).optional(),
    NEXT_PUBLIC_QRDX_BUSINESS_MONTHLY_PRODUCT_ID: z.string().min(1).optional(),
    NEXT_PUBLIC_QRDX_BUSINESS_YEARLY_PRODUCT_ID: z.string().min(1).optional(),
    // Cloudflare Turnstile on public forms (spam protection off without it)
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1).optional(),
    // Origin for default short links (falls back to the site URL)
    NEXT_PUBLIC_SHORT_LINK_BASE_URL: z.url().optional(),
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
    SCAN_HASH_SALT: process.env.SCAN_HASH_SALT,
    VERCEL_API_TOKEN: process.env.VERCEL_API_TOKEN,
    VERCEL_PROJECT_ID: process.env.VERCEL_PROJECT_ID,
    VERCEL_TEAM_ID: process.env.VERCEL_TEAM_ID,
    FAL_KEY: process.env.FAL_KEY,
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET: process.env.R2_BUCKET,
    R2_PUBLIC_BASE_URL: process.env.R2_PUBLIC_BASE_URL,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    WEB_RISK_API_KEY: process.env.WEB_RISK_API_KEY,
    TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY,
    CRON_SECRET: process.env.CRON_SECRET,
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_FEATUREBASE_APP_ID: process.env.NEXT_PUBLIC_FEATUREBASE_APP_ID,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    NEXT_PUBLIC_QRDX_PRO_MONTHLY_PRODUCT_ID:
      process.env.NEXT_PUBLIC_QRDX_PRO_MONTHLY_PRODUCT_ID,
    NEXT_PUBLIC_QRDX_PRO_YEARLY_PRODUCT_ID:
      process.env.NEXT_PUBLIC_QRDX_PRO_YEARLY_PRODUCT_ID,
    NEXT_PUBLIC_QRDX_BUSINESS_MONTHLY_PRODUCT_ID:
      process.env.NEXT_PUBLIC_QRDX_BUSINESS_MONTHLY_PRODUCT_ID,
    NEXT_PUBLIC_QRDX_BUSINESS_YEARLY_PRODUCT_ID:
      process.env.NEXT_PUBLIC_QRDX_BUSINESS_YEARLY_PRODUCT_ID,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    NEXT_PUBLIC_SHORT_LINK_BASE_URL:
      process.env.NEXT_PUBLIC_SHORT_LINK_BASE_URL,
  },
  emptyStringAsUndefined: true,
});
