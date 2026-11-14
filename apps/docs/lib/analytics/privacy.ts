// The PII guards live in @repo/analytics (packages/analytics/privacy.ts).
// Which of this app's pages record nothing is the app's to say: customer
// pages, the scanner, template demos and the other paths in
// components/landing/customer-page-paths.ts (any language). Registered here,
// and every analytics path in the app imports this module first, so the
// rule is in place before anything can be tracked.
import { registerUntrackedPaths } from "@repo/analytics/privacy";
import { isUntrackedPath } from "@/components/landing/customer-page-paths";

registerUntrackedPaths(isUntrackedPath);

export * from "@repo/analytics/privacy";
