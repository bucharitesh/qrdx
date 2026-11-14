// What the editor's /api/integrations/availability hands to the browser:
// hidden slugs in production (no variable names), names only in local dev.
import { describe, expect, it } from "vitest";
import type { IntegrationAvailability } from "@/lib/integration-availability-rules";
import {
  isHiddenIn,
  needsSetupIn,
  toAvailabilityView,
} from "@/lib/integration-availability-view";

const needsSetup = {
  dub: ["DUB_CLIENT_ID", "DUB_CLIENT_SECRET"],
  "google-drive": ["GOOGLE_CLIENT_ID"],
};

describe("toAvailabilityView", () => {
  it("lists hidden slugs and no variable names in production", () => {
    const production: IntegrationAvailability = {
      showUnavailable: false,
      needsSetup,
    };
    const view = toAvailabilityView(production);
    expect(view).toEqual({ hidden: ["dub", "google-drive"], needsSetup: {} });
    expect(JSON.stringify(view)).not.toContain("CLIENT");
    expect(isHiddenIn(view, "dub")).toBe(true);
    expect(isHiddenIn(view, "bitly")).toBe(false);
    expect(needsSetupIn(view, "dub")).toBeUndefined();
  });

  it("hides nothing and names what is missing in local dev", () => {
    const dev: IntegrationAvailability = { showUnavailable: true, needsSetup };
    const view = toAvailabilityView(dev);
    expect(view.hidden).toEqual([]);
    expect(isHiddenIn(view, "dub")).toBe(false);
    expect(needsSetupIn(view, "dub")).toEqual([
      "DUB_CLIENT_ID",
      "DUB_CLIENT_SECRET",
    ]);
    expect(needsSetupIn(view, "constructor")).toBeUndefined();
  });

  it("copies the map, so callers can't change the server's", () => {
    const dev: IntegrationAvailability = {
      showUnavailable: true,
      needsSetup: { dub: ["DUB_CLIENT_ID"] },
    };
    const view = toAvailabilityView(dev);
    view.needsSetup.box = ["BOX_CLIENT_ID"];
    expect(dev.needsSetup).toEqual({ dub: ["DUB_CLIENT_ID"] });
  });
});
