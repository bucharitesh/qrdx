// Checkout charges the currency the pricing page shows for the visitor's
// country. Polar reads the country from the IP address that creates the
// session (this server's), so the action passes the visitor's IP and the
// currency from the geo header, never from the display switch. Polar is
// faked; nothing is created.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_QRDX_PRO_MONTHLY_PRODUCT_ID = "prod_pro_month";
  process.env.NEXT_PUBLIC_QRDX_PRO_YEARLY_PRODUCT_ID = "prod_pro_year";
  return {
    headers: new Headers(),
    created: [] as Record<string, unknown>[],
    /** Currencies the fake products have no price in */
    missing: [] as string[],
    errors: [] as Record<string, unknown>[],
  };
});

vi.mock("next/headers", () => ({
  headers: async () => state.headers,
}));
vi.mock("@/lib/polar", () => ({
  isBillingConfigured: true,
  BILLING_NOT_CONFIGURED_MESSAGE: "Billing is not configured",
  polar: {
    checkouts: {
      create: async (body: Record<string, unknown>) => {
        if (state.missing.includes(String(body.currency))) {
          throw new Error(`No ${String(body.currency)} price`);
        }
        state.created.push(body);
        return { url: "https://checkout.example/session" };
      },
    },
  },
}));
vi.mock("@/actions/customer", () => ({
  getOrCreateCustomer: async () => ({ id: "cus_1" }),
}));
vi.mock("@/lib/analytics/server", () => ({
  hasAnalyticsConsent: async () => false,
}));
vi.mock("@/lib/subscription", () => ({
  getMyActiveSubscription: async () => null,
}));
vi.mock("@/lib/shared", () => ({
  logError: (_error: Error, context: Record<string, unknown>) => {
    state.errors.push(context);
  },
  getCurrentUser: async () => ({ id: "u_ana", email: "ana@example.com" }),
}));
vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  createRateLimiter: () => ({ limit: async () => ({ success: true }) }),
}));

const { createCheckout } = await import("@/actions/checkout");

beforeEach(() => {
  state.created = [];
  state.missing = [];
  state.errors = [];
});

const checkoutFrom = async (values: Record<string, string>) => {
  state.headers = new Headers(values);
  expect(await createCheckout({ plan: "pro", interval: "year" })).toEqual({
    url: "https://checkout.example/session",
  });
  return state.created.at(-1);
};

describe("createCheckout", () => {
  it("charges rupees in India and passes the visitor's IP", async () => {
    expect(
      await checkoutFrom({
        "x-vercel-ip-country": "IN",
        "x-real-ip": "203.0.113.7",
      }),
    ).toMatchObject({
      products: ["prod_pro_year"],
      customer_id: "cus_1",
      customer_ip_address: "203.0.113.7",
      currency: "inr",
    });
  });

  it("charges US dollars elsewhere, and in the EU until euro prices are on", async () => {
    expect(
      await checkoutFrom({
        "x-vercel-ip-country": "US",
        "x-forwarded-for": "198.51.100.4, 10.0.0.1",
      }),
    ).toMatchObject({ customer_ip_address: "198.51.100.4", currency: "usd" });
    expect(await checkoutFrom({ "x-vercel-ip-country": "DE" })).toMatchObject({
      currency: "usd",
    });
  });

  it("ignores the display switch and anything that isn't an IP address", async () => {
    const body = await checkoutFrom({
      "x-vercel-ip-country": "US",
      cookie: "qrdx_currency=inr",
      "x-real-ip": "not-an-ip",
    });
    expect(body).toMatchObject({ currency: "usd" });
    expect(body?.customer_ip_address).toBeUndefined();
  });

  it("falls back to Polar's default currency when a price is missing", async () => {
    state.missing = ["inr"];
    const body = await checkoutFrom({ "x-vercel-ip-country": "IN" });
    expect(body?.currency).toBeUndefined();
    expect(state.errors).toEqual([
      {
        action: "createCheckout",
        plan: "pro",
        interval: "year",
        currency: "inr",
      },
    ]);
  });
});
