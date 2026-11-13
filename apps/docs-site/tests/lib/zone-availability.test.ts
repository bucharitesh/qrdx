// What the docs site knows about the main app's features: its
// /zone/availability.json, fetched when the build starts
// (scripts/zone-inputs.mjs, lib/zone-availability.ts).
import {
  FEATURE_IDS,
  FEATURE_RULES,
  type PublishedAvailability,
} from "@repo/availability";
import { describe, expect, it } from "vitest";
import { zoneAvailability } from "@/lib/zone-availability";

const published = (
  available: readonly string[],
  extra: Partial<PublishedAvailability> = {},
): PublishedAvailability => ({
  available: available as PublishedAvailability["available"],
  unavailable: FEATURE_IDS.filter((id) => !available.includes(id)),
  hiddenPaths: [],
  hiddenIntegrations: [],
  ...extra,
});

describe("zoneAvailability", () => {
  it("treats everything that needs setup as unavailable without the main app's answer", () => {
    const zone = zoneAvailability({ source: null, availability: null });
    for (const id of FEATURE_IDS) expect(zone.features[id]).toBe(false);
    for (const id of FEATURE_IDS) {
      for (const path of FEATURE_RULES[id].paths ?? []) {
        expect(zone.hiddenPaths).toContain(path);
      }
    }
    expect(zone.isIntegrationVisible("slack")).toBe(false);
  });

  it("offers what the main app lists as available", () => {
    const zone = zoneAvailability({
      source: "https://qrdx.dev/zone/availability.json",
      availability: published(["customDomains", "email"]),
    });
    expect(zone.features.customDomains).toBe(true);
    expect(zone.features.email).toBe(true);
    expect(zone.features.aiArt).toBe(false);
    expect(zone.hiddenPaths).not.toContain(
      FEATURE_RULES.customDomains.paths?.[0],
    );
  });

  it("treats an id the main app doesn't list as unavailable", () => {
    // An older main app that doesn't know a feature yet lists it nowhere.
    const availability = published([...FEATURE_IDS]);
    availability.available = availability.available.filter(
      (id) => id !== "aiArt",
    );
    const zone = zoneAvailability({ source: "x", availability });
    expect(zone.features.aiArt).toBe(false);
  });

  it("hides the integrations and pages the main app hides", () => {
    const zone = zoneAvailability({
      source: "x",
      availability: published([...FEATURE_IDS], {
        hiddenPaths: ["/integrations/dub"],
        hiddenIntegrations: ["dub"],
      }),
    });
    expect(zone.isIntegrationVisible("dub")).toBe(false);
    expect(zone.isIntegrationVisible("zapier")).toBe(true);
    expect(zone.hiddenPaths).toContain("/integrations/dub");
  });
});
