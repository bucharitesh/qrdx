// What client components may learn about integration availability: which
// slugs to hide (production and preview) or, in local dev only, which env
// variable NAMES each still needs. Never values, and no names in production.
import type { IntegrationAvailability } from "@/lib/integration-availability-rules";

export interface AvailabilityView {
  /** Slugs to leave out of every list, button and picker. */
  hidden: string[];
  /** Local dev only: shown-but-unavailable slugs → missing variable names. */
  needsSetup: Record<string, string[]>;
}

export function toAvailabilityView(
  availability: IntegrationAvailability,
): AvailabilityView {
  return availability.showUnavailable
    ? { hidden: [], needsSetup: { ...availability.needsSetup } }
    : { hidden: Object.keys(availability.needsSetup).sort(), needsSetup: {} };
}

export function isHiddenIn(view: AvailabilityView, slug: string): boolean {
  return view.hidden.includes(slug);
}

/** The missing names to show on a "Needs setup" badge, if any (dev only). */
export function needsSetupIn(
  view: AvailabilityView,
  slug: string,
): string[] | undefined {
  return Object.hasOwn(view.needsSetup, slug)
    ? view.needsSetup[slug]
    : undefined;
}
