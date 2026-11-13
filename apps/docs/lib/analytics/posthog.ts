// Moved to @repo/analytics (packages/analytics/posthog.ts); this path stays
// for the app's imports. ./privacy registers the app's untracked pages first.
import "./privacy";

export * from "@repo/analytics/posthog";
