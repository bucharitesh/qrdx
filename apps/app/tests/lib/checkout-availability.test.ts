// getCheckoutOpen (lib/checkout-availability.ts): in-app upgrade buttons
// offer only plans checkout can sell here, as /pricing shows "Coming soon"
// for the rest. Billing and product ids are faked.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  billing: true,
  ids: {
    pro: { month: "prod_pro_m", year: null as string | null },
    business: { month: null as string | null, year: null as string | null },
  },
}));

vi.mock("@/lib/polar", () => ({
  get isBillingConfigured() {
    return state.billing;
  },
}));
vi.mock("@/lib/pricing", () => ({
  BILLING_INTERVALS: ["month", "year"],
  get PRICING() {
    return {
      pro: {
        month: { productId: state.ids.pro.month },
        year: { productId: state.ids.pro.year },
      },
      business: {
        month: { productId: state.ids.business.month },
        year: { productId: state.ids.business.year },
      },
    };
  },
}));

const { getCheckoutOpen } = await import("@/lib/checkout-availability");

beforeEach(() => {
  state.billing = true;
  state.ids.pro = { month: "prod_pro_m", year: null };
  state.ids.business = { month: null, year: null };
});

describe("getCheckoutOpen", () => {
  it("opens a plan with a product for either billing period", () => {
    expect(getCheckoutOpen()).toEqual({ pro: true, business: false });
    state.ids.business.year = "prod_biz_y";
    expect(getCheckoutOpen()).toEqual({ pro: true, business: true });
  });

  it("closes every plan without a Polar token", () => {
    state.billing = false;
    state.ids.business.year = "prod_biz_y";
    expect(getCheckoutOpen()).toEqual({ pro: false, business: false });
  });
});
