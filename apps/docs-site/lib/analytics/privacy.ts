// The PII guards live in @repo/analytics (packages/analytics/privacy.ts).
// Which pages record nothing is each app's to say. The docs site serves the
// docs and nothing else (on qrdx.dev, every other path belongs to the main
// app, which has its own rule), so it records its own pages only: a path
// that isn't a docs page counts as untracked. Registered here, and every
// analytics path in this app imports this module first, so the rule is in
// place before anything can be tracked.

import { registerUntrackedPaths } from "@repo/analytics/privacy";
import { isDocsPagePath } from "@repo/i18n/docs";

registerUntrackedPaths((path) => !isDocsPagePath(path));

export * from "@repo/analytics/privacy";
