// Run: cd apps/app && npx tsx --test lib/pricing.test.ts
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { isFlagOn } from "@repo/availability/flags";

const PRODUCT_IDS = {
  NEXT_PUBLIC_QRDX_PRO_MONTHLY_PRODUCT_ID: "prod_pro_month",
  NEXT_PUBLIC_QRDX_PRO_YEARLY_PRODUCT_ID: "prod_pro_year",
  NEXT_PUBLIC_QRDX_BUSINESS_MONTHLY_PRODUCT_ID: "prod_business_month",
  NEXT_PUBLIC_QRDX_BUSINESS_YEARLY_PRODUCT_ID: "prod_business_year",
};

let pricing: typeof import("./pricing");

before(async () => {
  // Product ids are read when the module loads.
  Object.assign(process.env, PRODUCT_IDS);
  pricing = await import("./pricing");
});

describe("PRICING", () => {
  it("matches the approved USD, INR and EUR display prices", () => {
    const { PRICING } = pricing;
    assert.deepEqual(PRICING.pro.month.amounts, { USD: 5, INR: 199, EUR: 5 });
    assert.deepEqual(PRICING.pro.year.amounts, {
      USD: 48,
      INR: 1499,
      EUR: 48,
    });
    assert.deepEqual(PRICING.business.month.amounts, {
      USD: 15,
      INR: 599,
      EUR: 15,
    });
    assert.deepEqual(PRICING.business.year.amounts, {
      USD: 144,
      INR: 4999,
      EUR: 144,
    });
  });

  it("offers euros only once the flag is on", () => {
    assert.equal(pricing.EUR_PRICES, false);
    assert.deepEqual(pricing.PRICING_CURRENCIES, ["USD", "INR"]);
    assert.deepEqual(pricing.pricingCurrencies(true), ["USD", "INR", "EUR"]);
    // The same switch as NEXT_PUBLIC_QRDX_EUR_PRICES's reader.
    assert.equal(isFlagOn("1"), true);
    assert.equal(isFlagOn(" TRUE "), true);
    for (const value of ["0", "false", "", "yes", undefined, null]) {
      assert.equal(isFlagOn(value), false, String(value));
    }
  });

  it("reads one product id per plan and interval", () => {
    for (const plan of pricing.PAID_PLANS) {
      for (const interval of pricing.BILLING_INTERVALS) {
        const price = pricing.PRICING[plan][interval];
        assert.equal(price.plan, plan);
        assert.equal(price.interval, interval);
        assert.equal(price.productId, PRODUCT_IDS[price.productIdEnv]);
      }
    }
  });
});

describe("planForProductId", () => {
  it("maps every configured product to its plan", () => {
    assert.equal(pricing.planForProductId("prod_pro_month"), "pro");
    assert.equal(pricing.planForProductId("prod_pro_year"), "pro");
    assert.equal(pricing.planForProductId("prod_business_month"), "business");
    assert.equal(pricing.planForProductId("prod_business_year"), "business");
  });

  it("returns null for other or missing products", () => {
    assert.equal(pricing.planForProductId("prod_legacy"), null);
    assert.equal(pricing.planForProductId(""), null);
    assert.equal(pricing.planForProductId(null), null);
    assert.equal(pricing.planForProductId(undefined), null);
  });
});

describe("display helpers", () => {
  it("shows INR only to visitors from India", () => {
    assert.equal(pricing.currencyForCountry("IN"), "INR");
    assert.equal(pricing.currencyForCountry(" in "), "INR");
    assert.equal(pricing.currencyForCountry("US"), "USD");
    assert.equal(pricing.currencyForCountry(null), "USD");
  });

  it("shows EUR in the EU and EEA once euro prices are on", () => {
    assert.equal(pricing.currencyForCountry("DE"), "USD");
    assert.equal(pricing.currencyForCountry("DE", true), "EUR");
    assert.equal(pricing.currencyForCountry("se", true), "EUR");
    assert.equal(pricing.currencyForCountry("NO", true), "EUR");
    assert.equal(pricing.currencyForCountry("GB", true), "USD");
    assert.equal(pricing.currencyForCountry("CH", true), "USD");
    assert.equal(pricing.currencyForCountry("IN", true), "INR");
    // 27 member states, 7 regions with their own codes, 3 EEA countries
    assert.equal(pricing.EUR_COUNTRIES.size, 37);
  });

  it("formats whole amounts without decimals", () => {
    assert.equal(pricing.formatPrice(5, "USD"), "$5");
    assert.equal(pricing.formatPrice(144, "USD"), "$144");
    assert.equal(pricing.formatPrice(1499, "INR"), "₹1,499");
    assert.equal(pricing.formatPrice(4999, "INR"), "₹4,999");
    assert.equal(pricing.formatPrice(4.5, "USD"), "$4.50");
    assert.equal(pricing.formatPrice(5, "EUR"), "€5");
    assert.equal(pricing.formatPrice(144, "EUR"), "€144");
    assert.match(pricing.formatPrice(48, "EUR", "de"), /^48\s€$/);
  });

  it("keeps the guarantee and the non-profit discount in one place", () => {
    assert.equal(pricing.MONEY_BACK_DAYS, 30);
    assert.equal(pricing.NONPROFIT_DISCOUNT_PERCENT, 50);
  });

  it("names every plan", () => {
    assert.deepEqual(pricing.PLAN_NAMES, {
      free: "Free",
      pro: "Pro",
      business: "Business",
    });
  });
});
