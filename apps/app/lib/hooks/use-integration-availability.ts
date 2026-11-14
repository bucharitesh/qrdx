"use client";

import { useEffect, useState } from "react";
import type { AvailabilityView } from "@/lib/integration-availability-view";

let cache: Promise<AvailabilityView> | null = null;

// If the check fails, nothing is hidden: the connect flows still refuse an
// integration that isn't set up, with their own message.
const NOTHING_HIDDEN: AvailabilityView = { hidden: [], needsSetup: {} };

function load(): Promise<AvailabilityView> {
  cache ??= fetch("/api/integrations/availability")
    .then((response) =>
      response.ok ? (response.json() as Promise<AvailabilityView>) : null,
    )
    .catch(() => null)
    .then((view) => {
      if (!view) cache = null; // failed: ask again next time
      return view ?? NOTHING_HIDDEN;
    });
  return cache;
}

/**
 * The server's integration availability (see lib/integration-availability);
 * null while loading. One request per page load, shared by every caller.
 */
export function useIntegrationAvailability(): AvailabilityView | null {
  const [view, setView] = useState<AvailabilityView | null>(null);
  useEffect(() => {
    let active = true;
    void load().then((result) => {
      if (active) setView(result);
    });
    return () => {
      active = false;
    };
  }, []);
  return view;
}
