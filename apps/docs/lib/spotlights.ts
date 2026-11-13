// Feature spotlights (components/app-shell/feature-spotlight.tsx): a "New"
// popover beside a recently shipped control, shown once per person. Each
// one has an id here; dismissed or used ones are listed in
// user.settings.spotlightsSeen (actions/spotlights.ts), mirrored in
// localStorage. Pure and client-safe.

/** Every spotlight in the app. Add an id here before using it. */
export const SPOTLIGHT_IDS = [
  // Settings → Profile & security → Two-step verification → Add passkey
  // (changelog v0.4.0: a passkey can be your second step).
  "passkey-second-step",
  // Not a spotlight: the app's "Get set up" launcher
  // (components/app-shell/setup-guide.tsx), once dismissed. It's a one-time
  // guide the account remembers the same way.
  "setup-guide",
] as const;

export type SpotlightId = (typeof SPOTLIGHT_IDS)[number];

/** Seen spotlights an account remembers (the newest ones). */
export const SPOTLIGHTS_LIMIT = 50;

/** This browser's seen spotlights, per person. */
export function spotlightStorageKey(userId: string): string {
  return `qrdx:spotlights-seen:${userId}`;
}

/**
 * The spotlight that may show now: the first one waiting on the page that
 * the person hasn't seen. Only one shows at a time; the next waits its turn.
 */
export function activeSpotlight(
  waiting: readonly string[],
  seen: ReadonlySet<string>,
): string | null {
  return waiting.find((id) => !seen.has(id)) ?? null;
}
