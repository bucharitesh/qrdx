// Run: cd apps/docs && npx tsx --test lib/region.test.ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkoutCurrency,
  countryFromHeaders,
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
    assert.equal(currencyForRegion("EU"), "EUR");
    assert.equal(overrideForCurrency("INR"), "inr");
    assert.equal(overrideForCurrency("USD"), "usd");
    assert.equal(overrideForCurrency("EUR"), "eur");
  });
});

// Euro prices: off until NEXT_PUBLIC_QRDX_EUR_PRICES is on (lib/pricing.ts).
describe("euro prices", () => {
  const on = { eur: true };
  const off = { eur: false };

  it("show for the EU and EEA only once they're on", () => {
    for (const country of ["DE", "fr", " PL ", "NO", "IS", "LI", "RE"]) {
      assert.equal(regionForCountry(country, on), "EU", country);
      assert.equal(regionForCountry(country, off), "default", country);
    }
    for (const country of ["GB", "CH", "US", "TR"]) {
      assert.equal(regionForCountry(country, on), "default", country);
    }
    assert.equal(regionForCountry("IN", on), "IN");
  });

  it("are off when the flag isn't set", () => {
    assert.equal(regionForCountry("DE"), "default");
    assert.equal(regionForOverride("eur"), null);
  });

  it("accept ?currency=eur and the cookie only while on", () => {
    assert.equal(regionForOverride("eur", on), "EU");
    assert.equal(regionForOverride("EUR", off), null);
    const germany = headers({ "x-vercel-ip-country": "DE" });
    assert.equal(resolveRegion({ headers: germany }, on), "EU");
    assert.equal(resolveRegion({ headers: germany }, off), "default");
    assert.equal(
      resolveRegion({ headers: germany, cookie: "usd" }, on),
      "default",
    );
    const us = headers({ "x-vercel-ip-country": "US" });
    assert.equal(resolveRegion({ headers: us, param: "eur" }, on), "EU");
    assert.equal(resolveRegion({ headers: us, param: "eur" }, off), "default");
  });
});

describe("checkoutCurrency", () => {
  it("charges the visitor's country's currency", () => {
    const from = (country: string) =>
      headers({ "x-vercel-ip-country": country });
    assert.equal(checkoutCurrency(from("IN")), "inr");
    assert.equal(checkoutCurrency(from("US")), "usd");
    assert.equal(checkoutCurrency(from("DE"), { eur: true }), "eur");
    assert.equal(checkoutCurrency(from("DE"), { eur: false }), "usd");
    assert.equal(checkoutCurrency(from("GB"), { eur: true }), "usd");
    assert.equal(checkoutCurrency(headers({}), { eur: true }), "usd");
    assert.equal(checkoutCurrency(null), "usd");
  });

  it("reads the Vercel header before the Cloudflare one", () => {
    assert.equal(
      countryFromHeaders(
        headers({ "x-vercel-ip-country": "us", "cf-ipcountry": "IN" }),
      ),
      "US",
    );
    assert.equal(countryFromHeaders(headers({ "cf-ipcountry": "in" })), "IN");
    assert.equal(countryFromHeaders(headers({})), null);
  });
});
