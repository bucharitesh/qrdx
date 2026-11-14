import { onValidationError } from "@repo/next-config/env-errors";
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

// The browser-side tools' public ids. NEXT_PUBLIC_ values are inlined into
// client bundles, so these are read through the literal process.env reads
// below. Each one is optional: without it, only its own tool stays off.
export const keys = () =>
  createEnv({
    client: {
      // PostHog product analytics, after the visitor's "Analytics" consent
      // (posthog.ts). Server events read it too (apps/app/lib/analytics/server.ts).
      NEXT_PUBLIC_POSTHOG_KEY: z.string().min(1).optional(),
      // Umami web analytics (cookieless). Off without the website id.
      NEXT_PUBLIC_UMAMI_WEBSITE_ID: z.string().min(1).optional(),
      NEXT_PUBLIC_UMAMI_SCRIPT_URL: z.url().optional(),
      // Featurebase feedback widget, after the "Functionality" consent
      NEXT_PUBLIC_FEATUREBASE_APP_ID: z.string().min(1).optional(),
    },
    runtimeEnv: {
      NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
      NEXT_PUBLIC_UMAMI_WEBSITE_ID: process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID,
      NEXT_PUBLIC_UMAMI_SCRIPT_URL: process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL,
      NEXT_PUBLIC_FEATUREBASE_APP_ID:
        process.env.NEXT_PUBLIC_FEATUREBASE_APP_ID,
    },
    emptyStringAsUndefined: true,
    onValidationError,
  });
