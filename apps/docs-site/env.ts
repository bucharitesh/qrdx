import { keys as config } from "@repo/config/keys";
import {
  onValidationError,
  validateTogether,
} from "@repo/next-config/env-errors";
import { keys as core } from "@repo/next-config/keys";
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

// The docs site's environment, validated when `next dev`, `next build` and
// the server start (next.config.ts). Only what the docs read: the core keys
// (NEXT_PUBLIC_APP_URL is qrdx.dev, the canonical origin every docs URL is
// written against), @repo/config's, the analytics ids and the CSP switches,
// plus MAIN_ZONE_URL. No database, no auth secret: the docs site has
// neither. Template with every variable explained: apps/docs-site/.env.example.
const production = process.env.NODE_ENV === "production";

export const env = validateTogether(() =>
  createEnv({
    extends: [config(), core()],
    server: {
      // The main app (qrdx.dev, or a staging deployment of it). The build
      // reads its /zone/availability.json for <IfAvailable> (scripts/
      // fetch-availability.mjs). Required in production builds and servers,
      // with no default: a docs build must say which app it belongs to.
      MAIN_ZONE_URL: production ? z.url() : z.url().optional(),

      // Public bucket URL or custom domain for served files (the CSP's
      // img-src and media-src list its origin, as in the main app)
      R2_PUBLIC_BASE_URL: z.url().optional(),

      // Content-Security-Policy switches (lib/security/csp.ts), as in the
      // main app: "1" sends the policy report-only, "1" upgrades http:// off
      // Vercel
      CSP_REPORT_ONLY: z.enum(["0", "1"]).optional(),
      CSP_HTTPS: z.enum(["0", "1"]).optional(),

      // GitHub token for the star counter in the docs (avoids API rate limits)
      GITHUB_TOKEN: z.string().min(1).optional(),

      // Standard Node.js environment
      NODE_ENV: z
        .enum(["development", "test", "production"])
        .default("development"),
    },
    client: {
      NEXT_PUBLIC_FEATUREBASE_APP_ID: z.string().min(1).optional(),
      NEXT_PUBLIC_POSTHOG_KEY: z.string().min(1).optional(),
      NEXT_PUBLIC_POSTHOG_HOST: z.url().min(1).optional(),
      // Umami web analytics (cookieless). Off without the website id.
      NEXT_PUBLIC_UMAMI_WEBSITE_ID: z.string().min(1).optional(),
      NEXT_PUBLIC_UMAMI_SCRIPT_URL: z.url().optional(),
    },
    runtimeEnv: {
      MAIN_ZONE_URL: process.env.MAIN_ZONE_URL,
      R2_PUBLIC_BASE_URL: process.env.R2_PUBLIC_BASE_URL,
      CSP_REPORT_ONLY: process.env.CSP_REPORT_ONLY,
      CSP_HTTPS: process.env.CSP_HTTPS,
      GITHUB_TOKEN: process.env.GITHUB_TOKEN,
      NODE_ENV: process.env.NODE_ENV,
      NEXT_PUBLIC_FEATUREBASE_APP_ID:
        process.env.NEXT_PUBLIC_FEATUREBASE_APP_ID,
      NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
      NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      NEXT_PUBLIC_UMAMI_WEBSITE_ID: process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID,
      NEXT_PUBLIC_UMAMI_SCRIPT_URL: process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL,
    },
    emptyStringAsUndefined: true,
    onValidationError,
  }),
);
