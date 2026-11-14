// /zone/availability.json (app/zone/availability.json/route.ts): what this
// deployment offers, published for QRdx's other deployments (the docs app
// reads it at build time). Public and cached, so it must carry ids, paths and
// slugs only: never a variable's name or value, nor a feature's display name.
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  FEATURE_IDS,
  FEATURE_RULES,
  type FeatureContext,
  PUBLISHED_AVAILABILITY_PATH,
  type PublishedAvailability,
  toPublishedAvailability,
} from "@repo/availability";
import {
  getIntegrationRegistry,
  initializeIntegrations,
} from "@repo/integrations";
import { getIntegrationCatalog } from "@repo/integrations/src/catalog";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as route from "@/app/zone/availability.json/route";
import { getPublicAvailability } from "@/lib/integration-availability";

initializeIntegrations();

const APP = join(import.meta.dirname, "../../app");

async function fetchDocument() {
  const response = route.GET();
  return {
    response,
    text: await response.clone().text(),
    body: (await response.json()) as PublishedAvailability,
  };
}

/** Every variable name a feature rule can ask for, in any context. */
const RULE_VARIABLES = [
  ...new Set(
    FEATURE_IDS.flatMap((id) =>
      [true, false].flatMap((onVercel) =>
        [true, false].flatMap((production) =>
          FEATURE_RULES[id].requires({
            env: {},
            onVercel,
            production,
          } satisfies FeatureContext),
        ),
      ),
    ),
  ),
];

/** Each string in a JSON value, at any depth. */
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(strings);
  }
  return [];
}

describe("/zone/availability.json", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is served from the path other deployments read", () => {
    expect(PUBLISHED_AVAILABILITY_PATH).toBe("/zone/availability.json");
    expect(existsSync(join(APP, PUBLISHED_AVAILABILITY_PATH, "route.ts"))).toBe(
      true,
    );
    // Built once per deploy, like the prerendered pages that read the same rules.
    expect(route.dynamic).toBe("force-static");
  });

  it("is public JSON that CDNs may cache and search engines leave out", async () => {
    const { response } = await fetchDocument();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    const cache = response.headers.get("cache-control") ?? "";
    expect(cache).toMatch(/^public,/);
    expect(cache).toMatch(/s-maxage=\d+/);
    expect(cache).not.toMatch(/private|no-store/);
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
  });

  it("says what pages already tell browsers, plus the features that are on", async () => {
    const { body } = await fetchDocument();
    const { available, ...rest } = body;
    expect(rest).toEqual(getPublicAvailability());
    expect(body).toEqual(toPublishedAvailability(getPublicAvailability()));
    expect([...available, ...body.unavailable].sort()).toEqual(
      [...FEATURE_IDS].sort(),
    );
    expect(available.filter((id) => body.unavailable.includes(id))).toEqual([]);
  });

  it("holds feature ids, page paths and integration slugs only", async () => {
    // Production hides integrations that need setup, so slugs show up too.
    vi.stubEnv("NODE_ENV", "production");
    const { body, text } = await fetchDocument();

    expect(Object.keys(body).sort()).toEqual([
      "available",
      "hiddenIntegrations",
      "hiddenPaths",
      "unavailable",
    ]);
    const ids: readonly string[] = FEATURE_IDS;
    for (const id of [...body.available, ...body.unavailable]) {
      expect(ids).toContain(id);
    }
    const paths = FEATURE_IDS.flatMap((id) => FEATURE_RULES[id].paths ?? []);
    for (const path of body.hiddenPaths) expect(paths).toContain(path);
    const slugs = [
      ...getIntegrationCatalog().map((entry) => entry.slug),
      ...getIntegrationRegistry()
        .getAll()
        .map((definition) => definition.slug),
    ];
    expect(body.hiddenIntegrations.length).toBeGreaterThan(0);
    for (const slug of body.hiddenIntegrations) expect(slugs).toContain(slug);

    // Nothing that could be a value: no spaces, schemes, hosts or emails.
    for (const value of strings(body)) {
      expect(value).toMatch(/^[A-Za-z0-9/[\]-]+$/);
    }

    // No variable names, feature names or configured values in the bytes.
    for (const name of RULE_VARIABLES) expect(text).not.toContain(name);
    for (const id of FEATURE_IDS) {
      expect(text).not.toContain(FEATURE_RULES[id].name);
    }
    const values = Object.values(process.env).filter(
      (value): value is string => typeof value === "string" && value.length > 7,
    );
    for (const value of values) expect(text).not.toContain(value);
  });
});
