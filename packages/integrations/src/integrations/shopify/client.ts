import { IntegrationApiError, providerRequest } from "../../core/http-client";
import type {
  ContentSourceClient,
  ListSourceOptions,
  SourceItem,
  SourcePage,
} from "../../sources/types";
import { formatDecimalMoney, httpsOrUndefined } from "../../sources/types";
import type {
  ShopifyGraphqlResponse,
  ShopifyProductNode,
  ShopifyProductsData,
  ShopifyShop,
  ShopifyTokenResponse,
} from "./types";

export const SHOPIFY_API_VERSION = "2026-10";
const PROVIDER = { slug: "shopify", name: "Shopify" };
const PAGE_SIZE = 50;
const CURSOR = /^[A-Za-z0-9+/=_-]{1,512}$/;

/** Only <store>.myshopify.com hosts are ever called (no SSRF). */
const SHOP_DOMAIN = /^[a-z0-9][a-z0-9-]{0,60}\.myshopify\.com$/;

/**
 * Normalizes what a merchant pastes ("mystore", "mystore.myshopify.com",
 * "https://admin.shopify.com/store/mystore") to "mystore.myshopify.com".
 */
export function normalizeShopDomain(input: string): string | null {
  let value = input.trim().toLowerCase();
  if (!value) return null;
  const admin = value.match(/admin\.shopify\.com\/store\/([a-z0-9][a-z0-9-]*)/);
  if (admin?.[1]) value = admin[1];
  value = value.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!value.includes(".")) value = `${value}.myshopify.com`;
  return SHOP_DOMAIN.test(value) ? value : null;
}

const PRODUCTS_QUERY = `query QrdxProducts($first: Int!, $after: String, $query: String) {
  products(first: $first, after: $after, query: $query, sortKey: TITLE) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      title
      handle
      status
      onlineStoreUrl
      featuredMedia { preview { image { url(transform: { maxWidth: 160, maxHeight: 160 }) } } }
      priceRangeV2 { minVariantPrice { amount currencyCode } maxVariantPrice { amount currencyCode } }
    }
  }
}`;

const SHOP_QUERY =
  "query QrdxShop { shop { name primaryDomain { url host } } }";

/** Search syntax: escape the merchant's words so they stay a title filter. */
function productQuery(search: string | undefined): string {
  const base = "status:active";
  const words = search
    ?.trim()
    .replace(/["\\:()]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6);
  if (!words?.length) return base;
  return `${base} AND ${words.map((word) => `title:*${word}*`).join(" AND ")}`;
}

function priceOf(node: ShopifyProductNode): string | undefined {
  const min = node.priceRangeV2?.minVariantPrice;
  const max = node.priceRangeV2?.maxVariantPrice;
  if (!min) return;
  const low = formatDecimalMoney(min.amount, min.currencyCode);
  if (max && Number(max.amount) > Number(min.amount)) {
    return `From ${low}`;
  }
  return low;
}

/** Store URL for a product: its Online Store page, else /products/<handle>. */
export function productUrl(
  node: Pick<ShopifyProductNode, "onlineStoreUrl" | "handle">,
  storefrontOrigin: string
): { url: string; published: boolean } {
  const published = httpsOrUndefined(node.onlineStoreUrl);
  if (published) return { url: published, published: true };
  return {
    url: `${storefrontOrigin.replace(/\/+$/, "")}/products/${encodeURIComponent(node.handle)}`,
    published: false,
  };
}

/**
 * Shopify Admin GraphQL with an Admin API access token (read_products):
 * products → their online-store URLs.
 */
export class ShopifyClient implements ContentSourceClient {
  private readonly shop: string;
  private readonly accessToken: string;
  private storefrontOrigin?: string;

  constructor(
    shop: string,
    accessToken: string,
    options: { storefrontOrigin?: string } = {}
  ) {
    const normalized = normalizeShopDomain(shop);
    if (!normalized) {
      throw new IntegrationApiError({
        provider: PROVIDER.slug,
        status: 400,
        code: "bad_request",
        message: "Enter your store's myshopify.com domain.",
      });
    }
    this.shop = normalized;
    this.accessToken = accessToken;
    this.storefrontOrigin = httpsOrUndefined(options.storefrontOrigin);
  }

  private async graphql<T>(
    query: string,
    variables: Record<string, unknown> = {}
  ): Promise<T> {
    const response = await providerRequest<ShopifyGraphqlResponse<T>>(
      PROVIDER,
      `https://${this.shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": this.accessToken,
        },
        body: JSON.stringify({ query, variables }),
      }
    );
    const throttled = response.errors?.some(
      (error) => error.extensions?.code === "THROTTLED"
    );
    if (throttled) {
      throw new IntegrationApiError({
        provider: PROVIDER.slug,
        status: 429,
        code: "rate_limited",
        message: "Shopify is rate limiting requests. Try again in a minute.",
        retryAfterSeconds: 2,
      });
    }
    if (response.errors?.length || !response.data) {
      const denied = response.errors?.some(
        (error) => error.extensions?.code === "ACCESS_DENIED"
      );
      throw new IntegrationApiError({
        provider: PROVIDER.slug,
        status: denied ? 403 : 400,
        code: denied ? "forbidden" : "bad_request",
        message: denied
          ? "Shopify: the app needs the read_products access scope."
          : "Shopify rejected the request.",
      });
    }
    return response.data;
  }

  async getShop(): Promise<ShopifyShop> {
    const data = await this.graphql<{ shop: ShopifyShop }>(SHOP_QUERY);
    this.storefrontOrigin =
      httpsOrUndefined(data.shop.primaryDomain?.url) ?? `https://${this.shop}`;
    return data.shop;
  }

  listProducts(params: {
    after?: string;
    search?: string;
    first?: number;
  }): Promise<ShopifyProductsData> {
    if (params.after && !CURSOR.test(params.after)) {
      throw new IntegrationApiError({
        provider: PROVIDER.slug,
        status: 400,
        code: "bad_request",
        message: "Shopify cursor is invalid.",
      });
    }
    return this.graphql<ShopifyProductsData>(PRODUCTS_QUERY, {
      first: Math.min(Math.max(params.first ?? PAGE_SIZE, 1), 250),
      after: params.after ?? null,
      query: productQuery(params.search),
    });
  }

  async list(options: ListSourceOptions = {}): Promise<SourcePage> {
    if (!this.storefrontOrigin) await this.getShop();
    const origin = this.storefrontOrigin ?? `https://${this.shop}`;
    const data = await this.listProducts({
      after: options.cursor,
      search: options.search,
    });
    const items: SourceItem[] = data.products.nodes.map((node) => {
      const { url, published } = productUrl(node, origin);
      return {
        id: node.id,
        title: node.title,
        subtitle: priceOf(node),
        url,
        image: httpsOrUndefined(node.featuredMedia?.preview?.image?.url),
        badge: published ? undefined : "Not on your online store",
      };
    });
    const { pageInfo } = data.products;
    return {
      items,
      nextCursor:
        pageInfo.hasNextPage && pageInfo.endCursor
          ? pageInfo.endCursor
          : undefined,
    };
  }
}

export function createShopifyClient(
  shop: string,
  accessToken: string,
  options?: { storefrontOrigin?: string }
): ShopifyClient {
  return new ShopifyClient(shop, accessToken, options);
}

/**
 * Dev Dashboard apps (the replacement for admin-created custom apps since
 * 2026): exchange the app's client credentials for a 24-hour Admin API token.
 * Only works for stores in the same organization as the app.
 */
export async function mintShopifyToken(options: {
  shop: string;
  clientId: string;
  clientSecret: string;
}): Promise<{ accessToken: string; expiresAt: Date | null; scope?: string }> {
  const shop = normalizeShopDomain(options.shop);
  if (!shop) {
    throw new IntegrationApiError({
      provider: PROVIDER.slug,
      status: 400,
      code: "bad_request",
      message: "Enter your store's myshopify.com domain.",
    });
  }
  const token = await providerRequest<ShopifyTokenResponse>(
    PROVIDER,
    `https://${shop}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: options.clientId,
        client_secret: options.clientSecret,
      }).toString(),
      // Shopify's message can quote the client id; keep ours.
      describeError: () => "rejected the app's client ID or secret.",
    }
  );
  if (!token.access_token) {
    throw new IntegrationApiError({
      provider: PROVIDER.slug,
      status: 502,
      code: "server",
      message: "Shopify did not return an access token.",
    });
  }
  return {
    accessToken: token.access_token,
    expiresAt: token.expires_in
      ? new Date(Date.now() + token.expires_in * 1000)
      : null,
    scope: token.scope,
  };
}
