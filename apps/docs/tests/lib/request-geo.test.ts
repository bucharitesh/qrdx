// Where a request comes from (lib/request-geo.ts): only the platform's own
// geo headers count. Each platform replaces its own headers but passes the
// other's through, so behind Cloudflare a client could send Vercel's country
// header (or the reverse) to pick or blank its country for the
// stolen-session check.
import { afterEach, describe, expect, it, vi } from "vitest";
import { geoPlatform, scanGeo } from "@/lib/request-geo";

afterEach(() => {
  vi.unstubAllEnvs();
});

const both = new Headers({
  "x-vercel-ip-country": "US",
  "x-vercel-ip-country-region": "CA",
  "x-vercel-ip-city": "San%20Francisco",
  "cf-ipcountry": "IN",
});

describe("the platform", () => {
  it("is Vercel where VERCEL is set, else Cloudflare", () => {
    expect(geoPlatform({ VERCEL: "1" })).toBe("vercel");
    expect(geoPlatform({})).toBe("cloudflare");
    expect(geoPlatform({ VERCEL: "" })).toBe("cloudflare");
    vi.stubEnv("VERCEL", "1");
    expect(geoPlatform()).toBe("vercel");
    vi.stubEnv("VERCEL", "");
    expect(geoPlatform()).toBe("cloudflare");
  });
});

describe("on Vercel", () => {
  it("reads Vercel's country, region and city, never Cloudflare's", () => {
    expect(scanGeo(both, "vercel")).toEqual({
      country: "US",
      region: "CA",
      city: "San Francisco",
    });
    // A client's Cloudflare header can't fill in a country Vercel left out.
    expect(scanGeo(new Headers({ "cf-ipcountry": "IN" }), "vercel")).toEqual({
      country: null,
      region: null,
      city: null,
    });
  });
});

describe("anywhere else (behind Cloudflare)", () => {
  it("reads Cloudflare's country, and no region or city", () => {
    expect(scanGeo(both, "cloudflare")).toEqual({
      country: "IN",
      region: null,
      city: null,
    });
  });

  it("can't be set or blanked with Vercel's headers", () => {
    // Set: Cloudflare said nothing, the client claims a country.
    expect(
      scanGeo(new Headers({ "x-vercel-ip-country": "US" }), "cloudflare")
        .country,
    ).toBeNull();
    // Blanked: an unknown-country claim doesn't hide Cloudflare's answer.
    expect(
      scanGeo(
        new Headers({ "x-vercel-ip-country": "XX", "cf-ipcountry": "DE" }),
        "cloudflare",
      ).country,
    ).toBe("DE");
  });

  it("is the default without VERCEL", () => {
    vi.stubEnv("VERCEL", "");
    expect(scanGeo(both).country).toBe("IN");
    vi.stubEnv("VERCEL", "1");
    expect(scanGeo(both).country).toBe("US");
  });

  it("keeps unknown and malformed countries out", () => {
    for (const value of ["XX", "T1", "usa", "", "1"]) {
      expect(
        scanGeo(new Headers({ "cf-ipcountry": value }), "cloudflare").country,
        value,
      ).toBeNull();
    }
    expect(
      scanGeo(new Headers({ "cf-ipcountry": "fr" }), "cloudflare").country,
    ).toBe("FR");
  });
});
