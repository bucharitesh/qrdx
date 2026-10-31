export interface ShopifyGraphqlResponse<T> {
  data?: T;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
}

export interface ShopifyShop {
  name: string;
  primaryDomain?: { url: string; host: string } | null;
}

export interface ShopifyMoney {
  amount: string;
  currencyCode: string;
}

export interface ShopifyProductNode {
  id: string;
  title: string;
  handle: string;
  status: "ACTIVE" | "ARCHIVED" | "DRAFT";
  onlineStoreUrl: string | null;
  featuredMedia?: {
    preview?: { image?: { url?: string | null } | null } | null;
  } | null;
  priceRangeV2?: {
    minVariantPrice: ShopifyMoney;
    maxVariantPrice?: ShopifyMoney;
  } | null;
}

export interface ShopifyProductsData {
  products: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: ShopifyProductNode[];
  };
}

export interface ShopifyTokenResponse {
  access_token: string;
  scope?: string;
  expires_in?: number;
}
