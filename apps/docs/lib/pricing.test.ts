// Run: cd apps/docs && npx tsx --test lib/pricing.test.ts
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

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
  it("matches the approved USD and INR display prices", () => {
    const { PRICING } = pricing;
    assert.deepEqual(PRICING.pro.month.amounts, { USD: 5, INR: 199 });
    assert.deepEqual(PRICING.pro.year.amounts, { USD: 48, INR: 1499 });
    assert.deepEqual(PRICING.business.month.amounts, { USD: 15, INR: 599 });
    assert.deepEqual(PRICING.business.year.amounts, { USD: 144, INR: 4999 });
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

  it("formats whole amounts without decimals", () => {
    assert.equal(pricing.formatPrice(5, "USD"), "$5");
    assert.equal(pricing.formatPrice(144, "USD"), "$144");
    assert.equal(pricing.formatPrice(1499, "INR"), "₹1,499");
    assert.equal(pricing.formatPrice(4999, "INR"), "₹4,999");
    assert.equal(pricing.formatPrice(4.5, "USD"), "$4.50");
  });

  it("names every plan", () => {
    assert.deepEqual(pricing.PLAN_NAMES, {
      free: "Free",
      pro: "Pro",
      business: "Business",
    });
  });
});
