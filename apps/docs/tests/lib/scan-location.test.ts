// Precise scan location (lib/scan-location): the rounding that keeps raw
// coordinates out of the database, the signed token that links a shared
// location to its scan, and the geofence routing condition (edges of the
// radius, the poles, and parsing that doesn't depend on the locale).
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  distanceMeters,
  formatDistance,
  formatLatLng,
  normalizeAccuracy,
  osmUrl,
  parseLatLng,
  roundCoordinate,
  roundedPoint,
  withinRadius,
} from "@/lib/scan-location/geo";

const {
  evaluateRouting,
  matchesCondition,
  networkPoint,
  routingConfigSchema,
  routingConditionSchema,
  signScanToken,
  splitBreakdownPlans,
} = await import("@/lib/redirect/routing");
const { signLocationToken, verifyLocationToken, LOCATION_TOKEN_TTL_SECONDS } =
  await import("@/lib/scan-location/token");
const { networkCoordinates } = await import("@/lib/request-geo");

type RoutingInput = Parameters<typeof evaluateRouting>[1];

const input = (overrides: Partial<RoutingInput> = {}): RoutingInput => ({
  deviceType: "mobile",
  os: "iOS",
  country: "US",
  region: "NY",
  language: "en-us",
  now: new Date("2026-11-11T12:00:00Z"),
  scanNumber: 1,
  visitorKey: "visitor-a",
  ...overrides,
});

/** A point `meters` due north of `from` (along a meridian: exact for a sphere). */
function north(from: { latitude: number; longitude: number }, meters: number) {
  return {
    latitude: from.latitude + (meters / 6_371_008.8) * (180 / Math.PI),
    longitude: from.longitude,
  };
}

const TIMES_SQUARE = { latitude: 40.758, longitude: -73.9855 };

afterEach(() => {
  vi.unstubAllEnvs();
});

// ─── Rounding ───────────────────────────────────────────────────────────────

describe("rounding", () => {
  it("keeps 3 decimals (about 100 m), never more", () => {
    expect(roundCoordinate(40.712812345)).toBe(40.713);
    expect(roundCoordinate(-74.006049)).toBe(-74.006);
    expect(roundCoordinate(51.5005)).toBe(51.501);
    expect(roundCoordinate(0.0004)).toBe(0);
    expect(Object.is(roundCoordinate(-0.0004), 0)).toBe(true);
    for (const value of [12.3456789, -33.86881, 139.69171, 0.12345]) {
      const text = String(roundCoordinate(value));
      expect(text.split(".")[1]?.length ?? 0).toBeLessThanOrEqual(3);
    }
  });

  it("refuses coordinates outside the globe", () => {
    expect(roundedPoint(90.0001, 0)).toBeNull();
    expect(roundedPoint(-91, 0)).toBeNull();
    expect(roundedPoint(0, 180.5)).toBeNull();
    expect(roundedPoint(Number.NaN, 0)).toBeNull();
    expect(roundedPoint("40", "-74")).toBeNull();
    expect(roundedPoint(Number.POSITIVE_INFINITY, 0)).toBeNull();
    expect(roundedPoint(90, -180)).toEqual({ latitude: 90, longitude: -180 });
    expect(roundedPoint(40.7128, -74.006)).toEqual({
      latitude: 40.713,
      longitude: -74.006,
    });
  });

  it("stores whole-meter accuracies and drops ones that aren't a location", () => {
    expect(normalizeAccuracy(12.6)).toBe(13);
    expect(normalizeAccuracy(0.2)).toBe(1);
    expect(normalizeAccuracy(100_000)).toBe(100_000);
    expect(normalizeAccuracy(100_001)).toBeNull();
    expect(normalizeAccuracy(-5)).toBeNull();
    expect(normalizeAccuracy(Number.NaN)).toBeNull();
    expect(normalizeAccuracy("20")).toBeNull();
  });
});

// ─── Distance ───────────────────────────────────────────────────────────────

describe("distance", () => {
  it("matches known great-circle distances", () => {
    const london = { latitude: 51.5074, longitude: -0.1278 };
    const newYork = { latitude: 40.7128, longitude: -74.006 };
    expect(distanceMeters(london, newYork) / 1000).toBeCloseTo(5570, -1);
    expect(distanceMeters(newYork, newYork)).toBe(0);
  });

  it("is stable at the poles and for opposite points", () => {
    const pole = { latitude: 90, longitude: 0 };
    // Every longitude is the same point at a pole.
    expect(distanceMeters(pole, { latitude: 90, longitude: 179 })).toBeLessThan(
      1e-6,
    );
    expect(
      distanceMeters(pole, { latitude: 89.999, longitude: 120 }),
    ).toBeCloseTo(111.2, 0);
    const southPole = { latitude: -90, longitude: 45 };
    expect(distanceMeters(pole, southPole) / 1000).toBeCloseTo(20_015, -1);
    const antipode = distanceMeters(
      { latitude: 10, longitude: 20 },
      { latitude: -10, longitude: -160 },
    );
    expect(Number.isFinite(antipode)).toBe(true);
    expect(antipode / 1000).toBeCloseTo(20_015, -1);
  });

  it("puts the edge of the radius inside, and a meter past it outside", () => {
    const radius = 500;
    expect(
      withinRadius(north(TIMES_SQUARE, radius - 0.01), TIMES_SQUARE, radius),
    ).toBe(true);
    expect(
      withinRadius(north(TIMES_SQUARE, radius + 1), TIMES_SQUARE, radius),
    ).toBe(false);
    // Near the pole too.
    const nearPole = { latitude: 89.99, longitude: 10 };
    expect(withinRadius(north(nearPole, 999), nearPole, 1000)).toBe(true);
    expect(withinRadius(north(nearPole, 1001), nearPole, 1000)).toBe(false);
  });
});

// ─── Parsing and formatting ─────────────────────────────────────────────────

describe("typed coordinates", () => {
  it("reads what map apps copy, and decimal commas", () => {
    expect(parseLatLng("40.7128, -74.0060")).toEqual({
      latitude: 40.7128,
      longitude: -74.006,
    });
    expect(parseLatLng("40.7128,-74.0060")).toEqual({
      latitude: 40.7128,
      longitude: -74.006,
    });
    expect(parseLatLng(" 40.7128 -74.0060 ")).toEqual({
      latitude: 40.7128,
      longitude: -74.006,
    });
    expect(parseLatLng("48,8566; 2,3522")).toEqual({
      latitude: 48.8566,
      longitude: 2.3522,
    });
    expect(parseLatLng("48,8566 2,3522")).toEqual({
      latitude: 48.8566,
      longitude: 2.3522,
    });
    expect(parseLatLng("(51.5°, -0.12°)")).toEqual({
      latitude: 51.5,
      longitude: -0.12,
    });
  });

  it("refuses anything that isn't a latitude and a longitude", () => {
    for (const text of [
      "",
      "Times Square",
      "40.7128",
      "91, 0",
      "0, 181",
      "1,2,3",
      "40.7128, -74.0060, 10",
    ]) {
      expect(parseLatLng(text)).toBeNull();
    }
  });

  it("formats without the locale's separators", () => {
    const toLocale = Number.prototype.toLocaleString;
    // Even where the browser would write 40,71280.
    Number.prototype.toLocaleString = function (this: number) {
      return String(this).replace(".", ",");
    };
    try {
      expect(formatLatLng({ latitude: 40.7128, longitude: -74.006 })).toBe(
        "40.7128, -74.006",
      );
      expect(formatDistance(1500)).toBe("1.5 km");
    } finally {
      Number.prototype.toLocaleString = toLocale;
    }
    expect(formatDistance(250.4)).toBe("250 m");
    expect(formatDistance(12_300)).toBe("12 km");
    expect(osmUrl({ latitude: 40.713, longitude: -74.006 })).toBe(
      "https://www.openstreetmap.org/?mlat=40.713&mlon=-74.006#map=16/40.713/-74.006",
    );
  });
});

// ─── Geofence condition ─────────────────────────────────────────────────────

describe("the area (geofence) routing condition", () => {
  const area = routingConditionSchema.parse({
    type: "geofence",
    latitude: TIMES_SQUARE.latitude,
    longitude: TIMES_SQUARE.longitude,
    radius: 1000,
  });

  it("matches a shared location inside the radius, edge included", () => {
    const at = (meters: number) =>
      input({ location: { ...north(TIMES_SQUARE, meters), source: "gps" } });
    expect(matchesCondition(area, at(0))).toBe(true);
    expect(matchesCondition(area, at(999.99))).toBe(true);
    expect(matchesCondition(area, at(1001))).toBe(false);
  });

  it("uses the network location the same way", () => {
    const location = { ...north(TIMES_SQUARE, 400), source: "ip" as const };
    expect(matchesCondition(area, input({ location }))).toBe(true);
  });

  it("doesn't match an unknown location, so 'is not' does", () => {
    expect(matchesCondition(area, input())).toBe(false);
    expect(matchesCondition(area, input({ location: null }))).toBe(false);
    expect(matchesCondition({ ...area, not: true }, input())).toBe(true);
  });

  it("routes inside vs outside the area, else the main destination", () => {
    const config = routingConfigSchema.parse({
      rules: [
        {
          id: "venue",
          conditions: [{ ...area }],
          action: { type: "redirect", url: "https://example.com/on-site" },
        },
      ],
    });
    const inside = evaluateRouting(
      config,
      input({ location: { ...north(TIMES_SQUARE, 200), source: "gps" } }),
      "https://example.com/sorry",
    );
    expect(inside.url).toBe("https://example.com/on-site");
    const outside = evaluateRouting(
      config,
      input({
        location: { latitude: 34.05, longitude: -118.24, source: "gps" },
      }),
      "https://example.com/sorry",
    );
    expect(outside.url).toBe("https://example.com/sorry");
    expect(outside.trace[0]?.conditions).toEqual([
      { type: "geofence", matched: false },
    ]);
  });

  it("validates the center and keeps the radius between 100 m and 500 km", () => {
    const parse = (overrides: Record<string, unknown>) =>
      routingConditionSchema.safeParse({
        type: "geofence",
        latitude: 40,
        longitude: -74,
        radius: 1000,
        ...overrides,
      }).success;
    expect(parse({})).toBe(true);
    expect(parse({ radius: 100 })).toBe(true);
    expect(parse({ radius: 500_000 })).toBe(true);
    expect(parse({ radius: 99 })).toBe(false);
    expect(parse({ radius: 500_001 })).toBe(false);
    expect(parse({ latitude: 91 })).toBe(false);
    expect(parse({ longitude: -180.1 })).toBe(false);
    expect(parse({ latitude: Number.NaN })).toBe(false);
    expect(parse({ latitude: "40" })).toBe(false);
  });

  it("marks A/B counts behind an area rule as estimates (scans don't keep the location used)", () => {
    const config = routingConfigSchema.parse({
      rules: [
        {
          id: "split",
          conditions: [{ ...area }],
          action: {
            type: "split",
            variants: [
              { id: "a", url: "https://example.com/a", weight: 50 },
              { id: "b", url: "https://example.com/b", weight: 50 },
            ],
          },
        },
      ],
    });
    expect(splitBreakdownPlans(config)[0]?.approximate).toBe(true);
  });
});

describe("network coordinates", () => {
  const headers = new Headers({
    "x-vercel-ip-latitude": "40.7128",
    "x-vercel-ip-longitude": "-74.0060",
  });

  it("are read from Vercel's headers only on Vercel", () => {
    expect(networkCoordinates(headers, "vercel")).toEqual({
      latitude: 40.7128,
      longitude: -74.006,
    });
    expect(networkCoordinates(headers, "cloudflare")).toBeNull();
    vi.stubEnv("VERCEL", "1");
    expect(networkPoint(headers)).toEqual({
      latitude: 40.7128,
      longitude: -74.006,
      source: "ip",
    });
  });

  it("ignore malformed or out-of-range values", () => {
    for (const [lat, lng] of [
      ["91", "0"],
      ["40", "181"],
      ["abc", "1"],
      ["1e2", "1"],
      ["", "1"],
    ]) {
      expect(
        networkCoordinates(
          new Headers({
            "x-vercel-ip-latitude": lat as string,
            "x-vercel-ip-longitude": lng as string,
          }),
          "vercel",
        ),
      ).toBeNull();
    }
  });
});

// ─── Token ──────────────────────────────────────────────────────────────────

describe("the location token", () => {
  const NOW = new Date("2026-11-11T12:00:00Z");
  const token = signLocationToken("cscan0000000000000000001", "ccode001", NOW);

  it("names its scan and code", () => {
    expect(verifyLocationToken(token, NOW)).toEqual({
      scanId: "cscan0000000000000000001",
      codeId: "ccode001",
      issuedAt: NOW,
    });
  });

  it("expires after 15 minutes and refuses times from the future", () => {
    const later = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);
    expect(
      verifyLocationToken(token, later(LOCATION_TOKEN_TTL_SECONDS)),
    ).not.toBeNull();
    expect(
      verifyLocationToken(token, later(LOCATION_TOKEN_TTL_SECONDS + 1)),
    ).toBeNull();
    expect(verifyLocationToken(token, later(-120))).toBeNull();
  });

  it("can't be altered, guessed or swapped for a conversion token", () => {
    const [scan, code, issued, sig] = token.split(".") as string[];
    const forged = [
      `cscan0000000000000000002.${code}.${issued}.${sig}`,
      `${scan}.ccode002.${issued}.${sig}`,
      `${scan}.${code}.${(Number.parseInt(issued as string, 36) + 60).toString(36)}.${sig}`,
      `${scan}.${code}.${issued}.${"A".repeat(22)}`,
      `${scan}.${code}.${issued}.${"é".repeat(22)}`,
      `${scan}.${code}.${issued}`,
      "",
      "x".repeat(500),
      signScanToken("cscan0000000000000000001", "ccode001", NOW),
    ];
    for (const value of forged) {
      expect(verifyLocationToken(value, NOW)).toBeNull();
    }
    expect(verifyLocationToken(42, NOW)).toBeNull();
    expect(verifyLocationToken(null, NOW)).toBeNull();
  });
});
