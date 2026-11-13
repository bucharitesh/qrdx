import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";
import { onValidationError } from "./env-errors";

export const keys = () =>
  createEnv({
    server: {
      // Bundle analyzer: ANALYZE=true bun run build
      ANALYZE: z.string().optional(),
      // Self-contained server build in .next/standalone (the Dockerfile sets it)
      NEXT_OUTPUT: z.enum(["standalone"]).optional(),

      // Added by Vercel
      NEXT_RUNTIME: z.enum(["nodejs", "edge"]).optional(),

      // Vercel environment variables
      VERCEL: z.string().optional(),
      VERCEL_ENV: z.enum(["development", "preview", "production"]).optional(),
      VERCEL_URL: z.string().optional(),
      VERCEL_BRANCH_URL: z.string().optional(),
      VERCEL_REGION: z.string().optional(),
      VERCEL_PROJECT_PRODUCTION_URL: z.string().optional(),
      // The deployment's commit (the admin health page)
      VERCEL_GIT_COMMIT_SHA: z.string().optional(),
      VERCEL_GIT_COMMIT_REF: z.string().optional(),
      VERCEL_GIT_COMMIT_MESSAGE: z.string().optional(),
      VERCEL_GIT_REPO_OWNER: z.string().optional(),
      VERCEL_GIT_REPO_SLUG: z.string().optional(),
    },
    client: {
      // Public URL of the web app, no trailing slash
      NEXT_PUBLIC_APP_URL: z.url(),
    },
    runtimeEnv: {
      ANALYZE: process.env.ANALYZE,
      NEXT_OUTPUT: process.env.NEXT_OUTPUT,
      NEXT_RUNTIME: process.env.NEXT_RUNTIME,
      VERCEL: process.env.VERCEL,
      VERCEL_ENV: process.env.VERCEL_ENV,
      VERCEL_URL: process.env.VERCEL_URL,
      VERCEL_BRANCH_URL: process.env.VERCEL_BRANCH_URL,
      VERCEL_REGION: process.env.VERCEL_REGION,
      VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
      VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA,
      VERCEL_GIT_COMMIT_REF: process.env.VERCEL_GIT_COMMIT_REF,
      VERCEL_GIT_COMMIT_MESSAGE: process.env.VERCEL_GIT_COMMIT_MESSAGE,
      VERCEL_GIT_REPO_OWNER: process.env.VERCEL_GIT_REPO_OWNER,
      VERCEL_GIT_REPO_SLUG: process.env.VERCEL_GIT_REPO_SLUG,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    },
    emptyStringAsUndefined: true,
    onValidationError,
  });
