import { keys as analytics } from "@repo/analytics/keys";
import { keys as auth } from "@repo/auth/keys";
import { keys as config } from "@repo/config/keys";
import { keys as database } from "@repo/database/keys";
import {
  onValidationError,
  validateTogether,
} from "@repo/next-config/env-errors";
import { keys as core } from "@repo/next-config/keys";
import { keys as rateLimit } from "@repo/rate-limit/keys";
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

// The app's environment, validated once when the server, `next dev` or
// `next build` starts (instrumentation.ts, next.config.ts). Packages declare
// their own variables in keys.ts and read them there; this extends them and
// adds the app's own. Three are required: NEXT_PUBLIC_APP_URL (core),
// DATABASE_URL (database) and BETTER_AUTH_SECRET (auth). Everything else is
// optional, and a missing value switches off only its own feature.
// Template with every variable explained: apps/app/.env.example.
export const env = validateTogether(() =>
  createEnv({
    extends: [analytics(), auth(), config(), core(), database(), rateLimit()],
    server: {
      // AI - Vercel AI Gateway (AI themes, prompt enhancement and AI QR art;
      // models per task in lib/ai/models.ts)
      AI_GATEWAY_API_KEY: z.string().min(1).optional(),

      // Payments - Polar
      POLAR_ACCESS_TOKEN: z.string().min(1).optional(),
      POLAR_WEBHOOK_SECRET: z.string().min(1).optional(),

      // Integrations - Dub
      DUB_CLIENT_ID: z.string().min(1).optional(),
      DUB_CLIENT_SECRET: z.string().min(1).optional(),
      DUB_REDIRECT_URI: z.url().min(1).optional(),

      // Integrations - Google Drive (reuses GOOGLE_CLIENT_ID/SECRET, @repo/auth)
      GOOGLE_DRIVE_REDIRECT_URI: z.url().optional(),

      // Integrations - short links and file pickers (callbacks are built from
      // the app URL; Rebrandly and Short.io use per-user API keys, no app needed)
      BITLY_CLIENT_ID: z.string().min(1).optional(),
      BITLY_CLIENT_SECRET: z.string().min(1).optional(),
      DROPBOX_CLIENT_ID: z.string().min(1).optional(),
      DROPBOX_CLIENT_SECRET: z.string().min(1).optional(),
      MICROSOFT_CLIENT_ID: z.string().min(1).optional(),
      MICROSOFT_CLIENT_SECRET: z.string().min(1).optional(),
      BOX_CLIENT_ID: z.string().min(1).optional(),
      BOX_CLIENT_SECRET: z.string().min(1).optional(),
      NOTION_CLIENT_ID: z.string().min(1).optional(),
      NOTION_CLIENT_SECRET: z.string().min(1).optional(),

      // Integrations - content sources and data out (callbacks are built from
      // the app URL; Google Sheets reuses GOOGLE_CLIENT_ID/SECRET; Stripe,
      // Cal.com and Shopify use per-user keys, no app needed)
      CALENDLY_CLIENT_ID: z.string().min(1).optional(),
      CALENDLY_CLIENT_SECRET: z.string().min(1).optional(),
      SLACK_CLIENT_ID: z.string().min(1).optional(),
      SLACK_CLIENT_SECRET: z.string().min(1).optional(),
      // The QRdx bot for Slack (/qr, mentions, DMs): verifies requests Slack
      // sends (lib/slack-bot). Off without it.
      SLACK_SIGNING_SECRET: z.string().min(1).optional(),
      HUBSPOT_CLIENT_ID: z.string().min(1).optional(),
      HUBSPOT_CLIENT_SECRET: z.string().min(1).optional(),
      MAILCHIMP_CLIENT_ID: z.string().min(1).optional(),
      MAILCHIMP_CLIENT_SECRET: z.string().min(1).optional(),
      // Discord bot (/qr and "Make QR code"): the app's id and public key from
      // the Discord developer portal. The bot token only registers commands
      // (plugins/discord), so the app never reads it.
      DISCORD_APPLICATION_ID: z.string().min(1).optional(),
      DISCORD_PUBLIC_KEY: z.string().min(1).optional(),
      // Optional "your channel's videos" / "your playlists" pickers
      YOUTUBE_API_KEY: z.string().min(1).optional(),
      SPOTIFY_CLIENT_ID: z.string().min(1).optional(),
      SPOTIFY_CLIENT_SECRET: z.string().min(1).optional(),

      // Telegram bot (QR codes in Telegram chats; off without all three):
      // the BotFather token, the webhook's secret_token and the bot's username
      TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
      TELEGRAM_WEBHOOK_SECRET: z.string().min(1).optional(),
      TELEGRAM_BOT_USERNAME: z.string().min(1).optional(),

      // Integration encryption (read by @repo/integrations encryptApiKey)
      INTEGRATION_ENCRYPTION_KEY: z.string().min(32).optional(),

      // Dynamic QR scans: salt for visitor_hash (falls back to one derived from BETTER_AUTH_SECRET)
      SCAN_HASH_SALT: z.string().min(16).optional(),

      // Custom domains via the Vercel Domains API (feature off without token + project id)
      VERCEL_API_TOKEN: z.string().min(1).optional(),
      VERCEL_PROJECT_ID: z.string().min(1).optional(),
      VERCEL_TEAM_ID: z.string().min(1).optional(),
      // One-click DNS setup (Domain Connect): our template's ids and the RSA
      // private key (PEM) that signs apply links (lib/domain-connect)
      DOMAIN_CONNECT_PROVIDER_ID: z.string().min(1).optional(),
      DOMAIN_CONNECT_SERVICE_ID: z.string().min(1).optional(),
      DOMAIN_CONNECT_PRIVATE_KEY: z.string().min(1).optional(),

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

      // Abuse limits, whole numbers above 0 (lib/safety/limits.ts reads them
      // and has the defaults used when unset): how many days an account
      // counts as new, the dynamic codes a new account can create per hour,
      // and the destinations one Web Risk recheck pass looks up
      SAFETY_YOUNG_ACCOUNT_DAYS: z
        .string()
        .regex(/^[1-9]\d{0,8}$/)
        .optional(),
      SAFETY_YOUNG_ACCOUNT_DYNAMIC_PER_HOUR: z
        .string()
        .regex(/^[1-9]\d{0,8}$/)
        .optional(),
      SAFETY_RECHECK_BATCH: z
        .string()
        .regex(/^[1-9]\d{0,8}$/)
        .optional(),

      // Search Console on /admin/growth: a Google service account's JSON key
      // (one line) with read access to sc-domain:qrdx.dev. Read server-side
      // only, never logged; the section explains the setup without it.
      GSC_SERVICE_ACCOUNT_JSON: z.string().min(1).optional(),

      // Cloudflare Turnstile verification (pairs with NEXT_PUBLIC_TURNSTILE_SITE_KEY)
      TURNSTILE_SECRET_KEY: z.string().min(1).optional(),

      // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` (webhook retries, digests)
      CRON_SECRET: z.string().min(16).optional(),

      // Content-Security-Policy switches, at build time and at run time
      // (lib/security/csp.ts reads them from the environment it's handed):
      // "1" sends the policy report-only, "1" upgrades http:// off Vercel
      CSP_REPORT_ONLY: z.enum(["0", "1"]).optional(),
      CSP_HTTPS: z.enum(["0", "1"]).optional(),

      // "QRdx in numbers" on the home page, "1" to show it. Decided at build
      // time: next.config.ts inlines it into server code (lib/home-numbers/flag.ts).
      QRDX_HOME_NUMBERS: z.enum(["0", "1"]).optional(),

      // GitHub token for the star counter in the docs (avoids API rate limits)
      GITHUB_TOKEN: z.string().min(1).optional(),

      // The docs site (apps/docs-site), e.g. https://docs.qrdx.dev: when set,
      // next.config.ts proxies the docs' URLs there and the sitemap and
      // llms.txt read its /zone/docs-manifest.json. Unset, this app serves
      // its own copy of the docs.
      DOCS_ZONE_URL: z.url().optional(),

      // OpenAI's plugin directory checks that we run the MCP host: the token
      // from its submission portal, served as plain text at
      // /.well-known/openai-apps-challenge (404 while unset)
      OPENAI_APPS_CHALLENGE: z.string().trim().min(1).optional(),

      // Standard Node.js environment
      NODE_ENV: z
        .enum(["development", "test", "production"])
        .default("development"),
    },
    client: {
      // PostHog's capture host for server events (lib/analytics/server.ts);
      // the key and the browser-side tools' ids are @repo/analytics's keys.
      NEXT_PUBLIC_POSTHOG_HOST: z.url().min(1).optional(),
      NEXT_PUBLIC_QRDX_PRO_MONTHLY_PRODUCT_ID: z.string().min(1).optional(),
      NEXT_PUBLIC_QRDX_PRO_YEARLY_PRODUCT_ID: z.string().min(1).optional(),
      NEXT_PUBLIC_QRDX_BUSINESS_MONTHLY_PRODUCT_ID: z
        .string()
        .min(1)
        .optional(),
      NEXT_PUBLIC_QRDX_BUSINESS_YEARLY_PRODUCT_ID: z.string().min(1).optional(),
      // "1" once every product above has a EUR price in Polar (lib/pricing.ts)
      NEXT_PUBLIC_QRDX_EUR_PRICES: z.string().min(1).optional(),
      // Cloudflare Turnstile on public forms (spam protection off without it)
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1).optional(),
    },
    runtimeEnv: {
      AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
      POLAR_ACCESS_TOKEN: process.env.POLAR_ACCESS_TOKEN,
      POLAR_WEBHOOK_SECRET: process.env.POLAR_WEBHOOK_SECRET,
      DUB_CLIENT_ID: process.env.DUB_CLIENT_ID,
      DUB_CLIENT_SECRET: process.env.DUB_CLIENT_SECRET,
      DUB_REDIRECT_URI: process.env.DUB_REDIRECT_URI,
      GOOGLE_DRIVE_REDIRECT_URI: process.env.GOOGLE_DRIVE_REDIRECT_URI,
      BITLY_CLIENT_ID: process.env.BITLY_CLIENT_ID,
      BITLY_CLIENT_SECRET: process.env.BITLY_CLIENT_SECRET,
      DROPBOX_CLIENT_ID: process.env.DROPBOX_CLIENT_ID,
      DROPBOX_CLIENT_SECRET: process.env.DROPBOX_CLIENT_SECRET,
      MICROSOFT_CLIENT_ID: process.env.MICROSOFT_CLIENT_ID,
      MICROSOFT_CLIENT_SECRET: process.env.MICROSOFT_CLIENT_SECRET,
      BOX_CLIENT_ID: process.env.BOX_CLIENT_ID,
      BOX_CLIENT_SECRET: process.env.BOX_CLIENT_SECRET,
      NOTION_CLIENT_ID: process.env.NOTION_CLIENT_ID,
      NOTION_CLIENT_SECRET: process.env.NOTION_CLIENT_SECRET,
      CALENDLY_CLIENT_ID: process.env.CALENDLY_CLIENT_ID,
      CALENDLY_CLIENT_SECRET: process.env.CALENDLY_CLIENT_SECRET,
      SLACK_CLIENT_ID: process.env.SLACK_CLIENT_ID,
      SLACK_CLIENT_SECRET: process.env.SLACK_CLIENT_SECRET,
      SLACK_SIGNING_SECRET: process.env.SLACK_SIGNING_SECRET,
      HUBSPOT_CLIENT_ID: process.env.HUBSPOT_CLIENT_ID,
      HUBSPOT_CLIENT_SECRET: process.env.HUBSPOT_CLIENT_SECRET,
      MAILCHIMP_CLIENT_ID: process.env.MAILCHIMP_CLIENT_ID,
      MAILCHIMP_CLIENT_SECRET: process.env.MAILCHIMP_CLIENT_SECRET,
      DISCORD_APPLICATION_ID: process.env.DISCORD_APPLICATION_ID,
      DISCORD_PUBLIC_KEY: process.env.DISCORD_PUBLIC_KEY,
      YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY,
      SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID,
      SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET,
      TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
      TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET,
      TELEGRAM_BOT_USERNAME: process.env.TELEGRAM_BOT_USERNAME,
      INTEGRATION_ENCRYPTION_KEY: process.env.INTEGRATION_ENCRYPTION_KEY,
      SCAN_HASH_SALT: process.env.SCAN_HASH_SALT,
      VERCEL_API_TOKEN: process.env.VERCEL_API_TOKEN,
      VERCEL_PROJECT_ID: process.env.VERCEL_PROJECT_ID,
      VERCEL_TEAM_ID: process.env.VERCEL_TEAM_ID,
      DOMAIN_CONNECT_PROVIDER_ID: process.env.DOMAIN_CONNECT_PROVIDER_ID,
      DOMAIN_CONNECT_SERVICE_ID: process.env.DOMAIN_CONNECT_SERVICE_ID,
      DOMAIN_CONNECT_PRIVATE_KEY: process.env.DOMAIN_CONNECT_PRIVATE_KEY,
      R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
      R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
      R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
      R2_BUCKET: process.env.R2_BUCKET,
      R2_PUBLIC_BASE_URL: process.env.R2_PUBLIC_BASE_URL,
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      EMAIL_FROM: process.env.EMAIL_FROM,
      WEB_RISK_API_KEY: process.env.WEB_RISK_API_KEY,
      SAFETY_YOUNG_ACCOUNT_DAYS: process.env.SAFETY_YOUNG_ACCOUNT_DAYS,
      SAFETY_YOUNG_ACCOUNT_DYNAMIC_PER_HOUR:
        process.env.SAFETY_YOUNG_ACCOUNT_DYNAMIC_PER_HOUR,
      SAFETY_RECHECK_BATCH: process.env.SAFETY_RECHECK_BATCH,
      GSC_SERVICE_ACCOUNT_JSON: process.env.GSC_SERVICE_ACCOUNT_JSON,
      TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY,
      CRON_SECRET: process.env.CRON_SECRET,
      CSP_REPORT_ONLY: process.env.CSP_REPORT_ONLY,
      CSP_HTTPS: process.env.CSP_HTTPS,
      QRDX_HOME_NUMBERS: process.env.QRDX_HOME_NUMBERS,
      GITHUB_TOKEN: process.env.GITHUB_TOKEN,
      DOCS_ZONE_URL: process.env.DOCS_ZONE_URL,
      OPENAI_APPS_CHALLENGE: process.env.OPENAI_APPS_CHALLENGE,
      NODE_ENV: process.env.NODE_ENV,
      NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      NEXT_PUBLIC_QRDX_PRO_MONTHLY_PRODUCT_ID:
        process.env.NEXT_PUBLIC_QRDX_PRO_MONTHLY_PRODUCT_ID,
      NEXT_PUBLIC_QRDX_PRO_YEARLY_PRODUCT_ID:
        process.env.NEXT_PUBLIC_QRDX_PRO_YEARLY_PRODUCT_ID,
      NEXT_PUBLIC_QRDX_BUSINESS_MONTHLY_PRODUCT_ID:
        process.env.NEXT_PUBLIC_QRDX_BUSINESS_MONTHLY_PRODUCT_ID,
      NEXT_PUBLIC_QRDX_BUSINESS_YEARLY_PRODUCT_ID:
        process.env.NEXT_PUBLIC_QRDX_BUSINESS_YEARLY_PRODUCT_ID,
      NEXT_PUBLIC_QRDX_EUR_PRICES: process.env.NEXT_PUBLIC_QRDX_EUR_PRICES,
      NEXT_PUBLIC_TURNSTILE_SITE_KEY:
        process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    },
    emptyStringAsUndefined: true,
    onValidationError,
  }),
);
