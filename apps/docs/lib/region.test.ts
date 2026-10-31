// Run: cd apps/docs && npx tsx --test lib/region.test.ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  currencyForRegion,
  overrideForCurrency,
  regionForCountry,
  regionForOverride,
  resolveRegion,
} from "./region";

const headers = (values: Record<string, string>) =>
  new Headers(values) as Pick<Headers, "get">;

describe("regionForCountry", () => {
  it("maps India to IN and everything else to default", () => {
    assert.equal(regionForCountry("IN"), "IN");
    assert.equal(regionForCountry(" in "), "IN");
    assert.equal(regionForCountry("US"), "default");
    assert.equal(regionForCountry("XX"), "default");
    assert.equal(regionForCountry(""), "default");
    assert.equal(regionForCountry(null), "default");
  });
});

describe("regionForOverride", () => {
  it("accepts usd and inr in any case", () => {
    assert.equal(regionForOverride("inr"), "IN");
    assert.equal(regionForOverride("INR"), "IN");
    assert.equal(regionForOverride("usd"), "default");
    assert.equal(regionForOverride(["inr", "usd"]), "IN");
  });

  it("ignores anything else", () => {
    assert.equal(regionForOverride("eur"), null);
    assert.equal(regionForOverride(""), null);
    assert.equal(regionForOverride(undefined), null);
    assert.equal(regionForOverride(42), null);
  });
});

describe("resolveRegion", () => {
  it("reads the Vercel header, then the Cloudflare header", () => {
    assert.equal(
      resolveRegion({ headers: headers({ "x-vercel-ip-country": "IN" }) }),
      "IN",
    );
    assert.equal(
      resolveRegion({ headers: headers({ "cf-ipcountry": "IN" }) }),
      "IN",
    );
    assert.equal(
      resolveRegion({
        headers: headers({ "x-vercel-ip-country": "US", "cf-ipcountry": "IN" }),
      }),
      "default",
    );
  });

  it("lets the cookie override the header and the param override both", () => {
    const india = headers({ "x-vercel-ip-country": "IN" });
    assert.equal(resolveRegion({ headers: india, cookie: "usd" }), "default");
    assert.equal(
      resolveRegion({ headers: india, cookie: "usd", param: "inr" }),
      "IN",
    );
    assert.equal(
      resolveRegion({ headers: india, cookie: "bogus", param: "bogus" }),
      "IN",
    );
  });

  it("defaults when nothing is known", () => {
    assert.equal(resolveRegion({}), "default");
    assert.equal(resolveRegion({ headers: headers({}) }), "default");
  });
});

describe("currency helpers", () => {
  it("round-trips between region, currency and override", () => {
    assert.equal(currencyForRegion("IN"), "INR");
    assert.equal(currencyForRegion("default"), "USD");
    assert.equal(overrideForCurrency("INR"), "inr");
    assert.equal(overrideForCurrency("USD"), "usd");
  });
});
