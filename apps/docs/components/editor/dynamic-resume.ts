// Picking "Dynamic" while signed out asks for sign-in and stores this intent
// as the post-login action (store/auth-store persists it across the OAuth
// redirect; the editor store keeps the design and content). After sign-in the
// URL form makes the code dynamic, but only for the same destination and only
// soon after the pick, so an abandoned sign-in never creates a code later.

/** Data of the "MAKE_DYNAMIC" post-login action. */
export interface MakeDynamicIntent {
  /** The normalized destination the visitor picked Dynamic for. */
  destination: string;
  /** When they picked it (ms since epoch). */
  at: number;
}

/** How long a pick stays good: long enough for any sign-in, OAuth included. */
export const MAKE_DYNAMIC_MAX_AGE_MS = 30 * 60 * 1000;

export function makeDynamicIntent(
  destination: string,
  now: number = Date.now(),
): MakeDynamicIntent {
  return { destination, at: now };
}

/**
 * True when a stored intent should run now: it is well formed, recent, and
 * the editor still holds the destination it was made for.
 */
export function shouldResumeDynamic(
  intent: unknown,
  currentDestination: string | null,
  now: number = Date.now(),
): intent is MakeDynamicIntent {
  if (!intent || typeof intent !== "object") return false;
  const { destination, at } = intent as Partial<MakeDynamicIntent>;
  if (typeof destination !== "string" || typeof at !== "number") return false;
  if (!Number.isFinite(at) || at > now) return false;
  if (now - at > MAKE_DYNAMIC_MAX_AGE_MS) return false;
  return currentDestination !== null && destination === currentDestination;
}
