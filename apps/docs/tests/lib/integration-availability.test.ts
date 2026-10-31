// Integrations that need setup on QRdx's side are hidden in production and
// marked "Needs setup" in local dev. The environment is injected: every value
// below is a fake placeholder, and only "is it set" is ever read.
import {
  getIntegrationRegistry,
  INTEGRATION_ENV_VARS,
  initializeIntegrations,
} from "@repo/integrations";
import { getCatalogBySurface } from "@repo/integrations/src/catalog";
import { describe, expect, it } from "vitest";
import {
  type AvailabilityContext,
  type AvailabilityDefinition,
  computeAvailability,
  ENCRYPTION_KEY_VAR,
  filterVisible,
  isAvailable,
  isVisible,
  missingSetup,
  setupNeeded,
} from "@/lib/integration-availability-rules";

const FAKE = "set";

const DEFINITIONS: Record<string, AvailabilityDefinition> = {
  acme: { type: "oauth" },
  "acme-drive": { type: "oauth" },
  shortener: { type: "oauth", apiKey: { label: "Token" } },
  keyed: { type: "api_key" },
  parser: { type: "none" },
};

function context(
  env: Record<string, string | undefined>,
  production: boolean,
): AvailabilityContext {
  return {
    env,
    production,
    definition: (slug) => DEFINITIONS[slug],
    credentials: (slug) =>
      ({
        acme: {
          clientId: "ACME_CLIENT_ID",
          clientSecret: "ACME_CLIENT_SECRET",
        },
        "acme-drive": {
          clientId: "ACME_CLIENT_ID",
          clientSecret: "ACME_CLIENT_SECRET",
          redirectUri: "ACME_DRIVE_REDIRECT_URI",
        },
      })[slug],
  };
}

describe("missingSetup", () => {
  it("needs nothing for guides, native features and link parsers", () => {
    const ctx = context({}, true);
    expect(missingSetup("zapier", ctx)).toEqual([]);
    expect(missingSetup("parser", ctx)).toEqual([]);
  });

  it("lists an OAuth app's missing credentials by name", () => {
    expect(missingSetup("acme", context({}, false))).toEqual([
      "ACME_CLIENT_ID",
      "ACME_CLIENT_SECRET",
    ]);
    expect(
      missingSetup("acme", context({ ACME_CLIENT_ID: FAKE }, false)),
    ).toEqual(["ACME_CLIENT_SECRET"]);
    expect(
      missingSetup(
        "acme-drive",
        context({ ACME_CLIENT_ID: FAKE, ACME_CLIENT_SECRET: FAKE }, false),
      ),
    ).toEqual(["ACME_DRIVE_REDIRECT_URI"]);
  });

  it("treats blank values as unset", () => {
    expect(
      missingSetup(
        "acme",
        context({ ACME_CLIENT_ID: "  ", ACME_CLIENT_SECRET: "" }, false),
      ),
    ).toEqual(["ACME_CLIENT_ID", "ACME_CLIENT_SECRET"]);
  });

  it("needs no app for user API keys or an API-key fallback, in dev", () => {
    expect(missingSetup("keyed", context({}, false))).toEqual([]);
    expect(missingSetup("shortener", context({}, false))).toEqual([]);
  });

  it("needs the encryption key in production for anything that stores a token", () => {
    const ctx = context(
      { ACME_CLIENT_ID: FAKE, ACME_CLIENT_SECRET: FAKE },
      true,
    );
    expect(missingSetup("acme", ctx)).toEqual([ENCRYPTION_KEY_VAR]);
    expect(missingSetup("keyed", ctx)).toEqual([ENCRYPTION_KEY_VAR]);
    expect(missingSetup("shortener", ctx)).toEqual([ENCRYPTION_KEY_VAR]);
    expect(missingSetup("parser", ctx)).toEqual([]);

    const ready = context(
      {
        ACME_CLIENT_ID: FAKE,
        ACME_CLIENT_SECRET: FAKE,
        [ENCRYPTION_KEY_VAR]: FAKE,
      },
      true,
    );
    expect(missingSetup("acme", ready)).toEqual([]);
    expect(missingSetup("keyed", ready)).toEqual([]);
  });

  it("falls back to conventional names for an OAuth app without a mapping", () => {
    const ctx: AvailabilityContext = {
      ...context({}, false),
      definition: () => ({ type: "oauth" }),
      credentials: () => undefined,
    };
    expect(missingSetup("new-thing", ctx)).toEqual([
      "NEW_THING_CLIENT_ID",
      "NEW_THING_CLIENT_SECRET",
    ]);
  });
});

describe("computeAvailability", () => {
  const slugs = ["acme", "keyed", "parser", "zapier", "acme"];

  it("hides what needs setup in production", () => {
    const availability = computeAvailability(slugs, context({}, true));
    expect(availability.showUnavailable).toBe(false);
    expect(availability.needsSetup).toEqual({
      acme: ["ACME_CLIENT_ID", "ACME_CLIENT_SECRET", ENCRYPTION_KEY_VAR],
      keyed: [ENCRYPTION_KEY_VAR],
    });
    expect(isVisible(availability, "acme")).toBe(false);
    expect(isVisible(availability, "keyed")).toBe(false);
    expect(isVisible(availability, "zapier")).toBe(true);
    expect(
      filterVisible(availability, ["acme", "parser", "zapier"], (s) => s),
    ).toEqual(["parser", "zapier"]);
  });

  it("shows everything in dev and says what is missing", () => {
    const availability = computeAvailability(slugs, context({}, false));
    expect(availability.showUnavailable).toBe(true);
    expect(isVisible(availability, "acme")).toBe(true);
    expect(isAvailable(availability, "acme")).toBe(false);
    expect(setupNeeded(availability, "acme")).toEqual([
      "ACME_CLIENT_ID",
      "ACME_CLIENT_SECRET",
    ]);
    expect(setupNeeded(availability, "keyed")).toBeUndefined();
    expect(setupNeeded(availability, "zapier")).toBeUndefined();
  });

  it("never carries a value, only names", () => {
    const secret = "fake-value-that-must-not-leak";
    const availability = computeAvailability(
      slugs,
      context({ ACME_CLIENT_ID: secret }, true),
    );
    expect(JSON.stringify(availability)).not.toContain(secret);
  });

  it("does not treat inherited object keys as slugs", () => {
    const availability = computeAvailability([], context({}, true));
    expect(isAvailable(availability, "constructor")).toBe(true);
    expect(isAvailable(availability, "toString")).toBe(true);
  });
});

describe("with the real registry", () => {
  initializeIntegrations();
  const registry = getIntegrationRegistry();
  const real = (
    env: Record<string, string | undefined>,
    production: boolean,
  ): AvailabilityContext => ({
    env,
    production,
    definition: (slug) => registry.get(slug),
    credentials: (slug) => INTEGRATION_ENV_VARS[slug],
  });
  const listed = getCatalogBySurface("integrations").map((entry) => entry.slug);

  it("hides every OAuth app and stored key with nothing configured in production", () => {
    const hidden = Object.keys(
      computeAvailability(listed, real({}, true)).needsSetup,
    ).sort();
    expect(hidden).toEqual(
      [
        "bitly",
        "box",
        "calcom",
        "calendly",
        "dropbox",
        "dub",
        "google-drive",
        "google-sheets",
        "hubspot",
        "mailchimp",
        "notion",
        "onedrive",
        "rebrandly",
        "shopify",
        "short-io",
        "slack",
        "stripe",
      ].sort(),
    );
  });

  it("keeps guides, pixels, webhooks-based and link-parsing entries without setup", () => {
    const availability = computeAvailability(listed, real({}, true));
    for (const slug of [
      "zapier",
      "make",
      "n8n",
      "discord",
      "youtube",
      "spotify",
      "google-analytics",
      "meta-pixel",
    ]) {
      expect(isAvailable(availability, slug), slug).toBe(true);
    }
  });

  it("needs only the encryption key for user-key integrations in production", () => {
    const availability = computeAvailability(listed, real({}, true));
    for (const slug of [
      "rebrandly",
      "short-io",
      "stripe",
      "calcom",
      "shopify",
      "bitly",
    ]) {
      expect(availability.needsSetup[slug], slug).toEqual([ENCRYPTION_KEY_VAR]);
    }
  });

  it("names the shared Google client and Drive's redirect URI", () => {
    const availability = computeAvailability(listed, real({}, false));
    expect(availability.needsSetup["google-drive"]).toEqual([
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "GOOGLE_DRIVE_REDIRECT_URI",
    ]);
    expect(availability.needsSetup["google-sheets"]).toEqual([
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
    ]);
  });
});
