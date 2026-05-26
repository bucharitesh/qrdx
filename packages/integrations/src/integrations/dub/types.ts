/**
 * Dub workspace information
 */
export interface DubWorkspace {
  id: string;
  name: string;
  slug: string;
  logo?: string;
  usage?: number;
  usageLimit?: number;
  plan?: string;
}

/**
 * Dub link information
 */
export interface DubLink {
  id: string;
  domain: string;
  key: string;
  url: string;
  title?: string;
  description?: string;
  qrCode?: string;
  archived: boolean;
  expiresAt?: string;
  clicks?: number;
  userId?: string;
  createdAt: string;
}

export type DubAnalyticsGroupBy =
  | "timeseries"
  | "countries"
  | "devices"
  | "browsers"
  | "os";

export type DubAnalyticsEvent = "clicks" | "leads" | "sales";

export type DubAnalyticsResult =
  | number
  | Record<string, string | number | null>[];

/**
 * Dub API error response
 */
export interface DubError {
  error: {
    code: string;
    message: string;
    doc_url?: string;
  };
}
