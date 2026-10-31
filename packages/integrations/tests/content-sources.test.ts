import { describe, expect, it } from "vitest";
import { verifyContentSourceCredentials } from "../src/capabilities/data-factory";
import type { IntegrationApiError } from "../src/core/http-client";
import { createCalcomClient } from "../src/integrations/calcom/client";
import {
  createCalendlyClient,
  revokeCalendlyToken,
} from "../src/integrations/calendly/client";
import {
  createShopifyClient,
  mintShopifyToken,
  normalizeShopDomain,
  productUrl,
} from "../src/integrations/shopify/client";
import {
  createStripeClient,
  isStripeSecretKey,
  STRIPE_RESTRICTED_KEY,
} from "../src/integrations/stripe/client";
import { bodyOf, json, mockFetch, networkError } from "./helpers";

const RK = "rk_test_51Habc0123456789abcdefXYZ";

const link = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  object: "payment_link",
  active: true,
  url: `https://buy.stripe.com/${id}`,
  line_items: {
    object: "list",
    has_more: false,
    data: [
      {
        id: `li_${id}`,
        description: "Tasting menu",
        amount_total: 4500,
        currency: "usd",
        price: { id: "price_1", recurring: null },
      },
    ],
  },
  ...overrides,
});

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as IntegrationApiError;
  }
  throw new Error("expected a rejection");
}

describe("Stripe Payment Links", () => {
  it("accepts restricted keys only", () => {
    expect(STRIPE_RESTRICTED_KEY.test(RK)).toBe(true);
    expect(STRIPE_RESTRICTED_KEY.test("sk_live_abcdefabcdefabcdef")).toBe(
      false
    );
    expect(isStripeSecretKey("sk_live_abc")).toBe(true);
    expect(isStripeSecretKey(RK)).toBe(false);
  });

  it("lists active links with line items, bearer auth and money formatting", async () => {
    const { calls } = mockFetch(
      json({
        object: "list",
        has_more: true,
        data: [link("plink_A1"), link("plink_B2", { active: false })],
      })
    );
    const page = await createStripeClient(RK).list();
    const call = calls[0];
    expect(call?.headers.authorization).toBe(`Bearer ${RK}`);
    const url = new URL(call?.url ?? "");
    expect(url.pathname).toBe("/v1/payment_links");
    expect(url.searchParams.get("active")).toBe("true");
    expect(url.searchParams.getAll("expand[]")).toEqual(["data.line_items"]);
    expect(page.items).toEqual([
      {
        id: "plink_A1",
        title: "Tasting menu",
        subtitle: "$45.00",
        url: "https://buy.stripe.com/plink_A1",
        badge: "Test mode",
      },
    ]);
    // has_more → the last link's id is the next cursor
    expect(page.nextCursor).toBe("plink_B2");
  });

  it("paginates with starting_after and rejects odd cursors", async () => {
    const { calls } = mockFetch(
      json({ object: "list", has_more: false, data: [] })
    );
    const page = await createStripeClient(RK).list({ cursor: "plink_B2" });
    expect(
      new URL(calls[0]?.url ?? "").searchParams.get("starting_after")
    ).toBe("plink_B2");
    expect(page.nextCursor).toBeUndefined();
    const error = await rejection(
      createStripeClient(RK).list({ cursor: "../../x" })
    );
    expect(error.code).toBe("bad_request");
  });

  it("maps 401/403/429/5xx without echoing Stripe's message", async () => {
    mockFetch(
      json(
        {
          error: {
            message: `Invalid API Key provided: ${RK}`,
            type: "invalid_request_error",
          },
        },
        401
      ),
      json(
        { error: { code: "secret_key_required", message: "needs rk with x" } },
        403
      ),
      json({ error: { message: "slow down" } }, 429, { "retry-after": "7" }),
      json({}, 503),
      networkError()
    );
    const client = createStripeClient(RK);
    const unauthorized = await rejection(client.list());
    expect(unauthorized.code).toBe("unauthorized");
    expect(unauthorized.message).not.toContain(RK);
    const forbidden = await rejection(client.list());
    expect(forbidden.code).toBe("forbidden");
    expect(forbidden.message).toContain("more permissions");
    const limited = await rejection(client.list());
    expect(limited.code).toBe("rate_limited");
    expect(limited.retryAfterSeconds).toBe(7);
    expect((await rejection(client.list())).code).toBe("server");
    expect((await rejection(client.list())).code).toBe("network");
  });

  it("verification stores a key hint, never the full key in metadata", async () => {
    mockFetch(json({ object: "list", has_more: false, data: [] }));
    const verified = await verifyContentSourceCredentials({
      provider: "stripe",
      apiKey: RK,
    });
    expect(verified.accessToken).toBe(RK);
    expect(JSON.stringify(verified.metadata)).not.toContain(RK);
    expect(verified.metadata.testMode).toBe(true);
  });
});

describe("Cal.com", () => {
  const KEY = "cal_live_0123456789abcdef0123";

  it("reads the username, then event types with the API version header", async () => {
    const { calls } = mockFetch(
      json({ status: "success", data: { id: 1, username: "ada" } }),
      json({
        status: "success",
        data: [
          { id: 10, title: "Intro", slug: "intro", lengthInMinutes: 15 },
          { id: 11, title: "Secret", slug: "secret", hidden: true },
          {
            id: 12,
            title: "Tour",
            slug: "tour",
            lengthInMinutes: 45,
            bookingUrl: "https://acme.cal.com/ada/tour",
          },
        ],
      })
    );
    const page = await createCalcomClient(KEY).list({ search: "" });
    expect(calls[0]?.url).toBe("https://api.cal.com/v2/me");
    expect(calls[0]?.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(new URL(calls[1]?.url ?? "").searchParams.get("username")).toBe(
      "ada"
    );
    expect(calls[1]?.headers["cal-api-version"]).toBeTruthy();
    expect(page.items.map((item) => item.url)).toEqual([
      "https://cal.com/ada/intro",
      "https://acme.cal.com/ada/tour",
    ]);
    expect(page.items[0]?.subtitle).toBe("15 min");
  });

  it("filters by search and maps 401", async () => {
    mockFetch(
      json({
        status: "success",
        data: [
          { id: 1, title: "Intro", slug: "intro" },
          { id: 2, title: "Tour", slug: "tour" },
        ],
      })
    );
    const page = await createCalcomClient(KEY, { username: "ada" }).list({
      search: "tou",
    });
    expect(page.items.map((item) => item.title)).toEqual(["Tour"]);
    mockFetch(json({ status: "error" }, 401));
    expect((await rejection(createCalcomClient(KEY).list())).code).toBe(
      "unauthorized"
    );
  });
});

describe("Calendly", () => {
  const USER = "https://api.calendly.com/users/AAAA-1111";

  it("lists active event types for the current user, with page tokens", async () => {
    const { calls } = mockFetch(
      json({ resource: { uri: USER, name: "Ada" } }),
      json({
        collection: [
          {
            uri: "https://api.calendly.com/event_types/E1",
            name: "Coffee",
            active: true,
            scheduling_url: "https://calendly.com/ada/coffee",
            duration: 30,
          },
          {
            uri: "https://api.calendly.com/event_types/E2",
            name: "Old",
            active: false,
            scheduling_url: "https://calendly.com/ada/old",
          },
          {
            uri: "https://api.calendly.com/event_types/E3",
            name: "VIP",
            active: true,
            scheduling_url: "https://calendly.com/ada/vip",
            secret: true,
          },
        ],
        pagination: { count: 3, next_page_token: "tok_2" },
      }),
      json({ collection: [], pagination: { count: 0, next_page_token: null } })
    );
    const client = createCalendlyClient("cal-token");
    const page = await client.list();
    expect(calls[0]?.headers.authorization).toBe("Bearer cal-token");
    const url = new URL(calls[1]?.url ?? "");
    expect(url.searchParams.get("user")).toBe(USER);
    expect(url.searchParams.get("active")).toBe("true");
    expect(page.items.map((item) => item.id)).toEqual(["E1", "E3"]);
    expect(page.items[1]?.badge).toBe("Secret link");
    expect(page.nextCursor).toBe("tok_2");
    const next = await client.list({ cursor: "tok_2" });
    expect(new URL(calls[2]?.url ?? "").searchParams.get("page_token")).toBe(
      "tok_2"
    );
    expect(next.nextCursor).toBeUndefined();
  });

  it("maps 403 and 429, and revokes with the client credentials", async () => {
    mockFetch(json({ title: "Permission Denied" }, 403), json({}, 429));
    const client = createCalendlyClient("t", { userUri: USER });
    expect((await rejection(client.list())).code).toBe("forbidden");
    expect((await rejection(client.list())).code).toBe("rate_limited");

    const { calls } = mockFetch(json({}));
    await revokeCalendlyToken({
      token: "refresh-1",
      clientId: "cid",
      clientSecret: "sec",
    });
    expect(calls[0]?.url).toBe("https://auth.calendly.com/oauth/revoke");
    expect(Object.fromEntries(new URLSearchParams(calls[0]?.body))).toEqual({
      client_id: "cid",
      client_secret: "sec",
      token: "refresh-1",
    });
  });
});

describe("Shopify", () => {
  it("normalizes what merchants paste and refuses other hosts", () => {
    expect(normalizeShopDomain("My-Store")).toBe("my-store.myshopify.com");
    expect(normalizeShopDomain("https://my-store.myshopify.com/admin")).toBe(
      "my-store.myshopify.com"
    );
    expect(
      normalizeShopDomain("https://admin.shopify.com/store/my-store/products")
    ).toBe("my-store.myshopify.com");
    expect(normalizeShopDomain("evil.com")).toBeNull();
    expect(normalizeShopDomain("169.254.169.254")).toBeNull();
    expect(normalizeShopDomain("a.myshopify.com.evil.com")).toBeNull();
  });

  it("uses the online-store URL, else /products/<handle> on the primary domain", () => {
    expect(
      productUrl(
        { onlineStoreUrl: "https://shop.example.com/products/a", handle: "a" },
        "https://x"
      )
    ).toEqual({
      url: "https://shop.example.com/products/a",
      published: true,
    });
    expect(
      productUrl(
        { onlineStoreUrl: null, handle: "gift card" },
        "https://shop.example.com/"
      )
    ).toEqual({
      url: "https://shop.example.com/products/gift%20card",
      published: false,
    });
  });

  it("queries products over GraphQL with the access token and paginates", async () => {
    const { calls } = mockFetch(
      json({
        data: {
          shop: {
            name: "Corner",
            primaryDomain: {
              url: "https://shop.example.com",
              host: "shop.example.com",
            },
          },
        },
      }),
      json({
        data: {
          products: {
            pageInfo: { hasNextPage: true, endCursor: "eyJsYXN0IjoxfQ==" },
            nodes: [
              {
                id: "gid://shopify/Product/1",
                title: "Pour-over set",
                handle: "pour-over",
                status: "ACTIVE",
                onlineStoreUrl: null,
                featuredMedia: {
                  preview: { image: { url: "https://cdn.shopify.com/a.jpg" } },
                },
                priceRangeV2: {
                  minVariantPrice: { amount: "14.0", currencyCode: "USD" },
                  maxVariantPrice: { amount: "20.0", currencyCode: "USD" },
                },
              },
            ],
          },
        },
      })
    );
    const page = await createShopifyClient("corner", "shpat_abc").list({
      search: 'mug "x"',
    });
    expect(calls[1]?.url).toBe(
      "https://corner.myshopify.com/admin/api/2026-10/graphql.json"
    );
    expect(calls[1]?.headers["x-shopify-access-token"]).toBe("shpat_abc");
    const body = bodyOf(calls[1]) as { variables: { query: string } };
    expect(body.variables.query).toBe(
      "status:active AND title:*mug* AND title:*x*"
    );
    expect(page.items[0]).toMatchObject({
      title: "Pour-over set",
      subtitle: "From $14.00",
      url: "https://shop.example.com/products/pour-over",
      image: "https://cdn.shopify.com/a.jpg",
      badge: "Not on your online store",
    });
    expect(page.nextCursor).toBe("eyJsYXN0IjoxfQ==");
  });

  it("maps THROTTLED, ACCESS_DENIED and 401", async () => {
    mockFetch(
      json({
        errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }],
      }),
      json({
        errors: [{ message: "denied", extensions: { code: "ACCESS_DENIED" } }],
      }),
      json({ errors: "[API] Invalid API key or access token" }, 401)
    );
    const client = createShopifyClient("corner", "shpat_abc", {
      storefrontOrigin: "https://shop.example.com",
    });
    expect((await rejection(client.list())).code).toBe("rate_limited");
    expect((await rejection(client.list())).code).toBe("forbidden");
    expect((await rejection(client.list())).code).toBe("unauthorized");
  });

  it("mints a 24-hour token from client credentials (token refresh)", async () => {
    const { calls } = mockFetch(
      json({
        access_token: "shpat_new",
        scope: "read_products",
        expires_in: 86_399,
      })
    );
    const minted = await mintShopifyToken({
      shop: "corner",
      clientId: "cid",
      clientSecret: "csec",
    });
    expect(calls[0]?.url).toBe(
      "https://corner.myshopify.com/admin/oauth/access_token"
    );
    expect(Object.fromEntries(new URLSearchParams(calls[0]?.body))).toEqual({
      grant_type: "client_credentials",
      client_id: "cid",
      client_secret: "csec",
    });
    expect(minted.accessToken).toBe("shpat_new");
    expect(minted.expiresAt?.getTime()).toBeGreaterThan(
      Date.now() + 86_000_000
    );

    mockFetch(
      json(
        { error: "invalid_client", error_description: "client cid is bad" },
        401
      )
    );
    const error = await rejection(
      mintShopifyToken({ shop: "corner", clientId: "cid", clientSecret: "x" })
    );
    expect(error.message).not.toContain("cid");
  });
});
