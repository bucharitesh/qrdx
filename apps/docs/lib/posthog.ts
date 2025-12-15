import posthog from "posthog-js";
import { env } from "@/lib/env";

export function initPostHog() {
  if (process.env.NODE_ENV === "development") return;
  const posthogKey = env.NEXT_PUBLIC_POSTHOG_KEY;
  if (posthogKey) {
    posthog.init(posthogKey, {
      api_host: env.NEXT_PUBLIC_POSTHOG_HOST,
    });
  } else {
    console.warn("PostHog key is missing, skipping initialization.");
  }
}
