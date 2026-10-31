import { IntegrationApiError, providerRequest } from "../../core/http-client";
import type {
  ContentSourceClient,
  ListSourceOptions,
  SourceItem,
  SourcePage,
} from "../../sources/types";
import { filterSourceItems, formatMoney } from "../../sources/types";
import type { StripeList, StripePaymentLink } from "./types";

const BASE_URL = "https://api.stripe.com/v1";
const PROVIDER = { slug: "stripe", name: "Stripe" };
const PAGE_SIZE = 50;
const CURSOR = /^plink_[A-Za-z0-9]{1,64}$/;

/** Restricted keys only: rk_live_… / rk_test_… */
export const STRIPE_RESTRICTED_KEY = /^rk_(live|test)_[A-Za-z0-9]{16,247}$/;

/** True for a full secret key, which QRdx refuses to store. */
export function isStripeSecretKey(value: string): boolean {
  return /^sk_(live|test)_/.test(value.trim());
}

export function isStripeTestKey(key: string): boolean {
  return key.startsWith("rk_test_");
}

/** Never echo Stripe's message: it can quote the key prefix. */
function describeStripeError(body: unknown): string | undefined {
  const error = (body as { error?: { code?: unknown; type?: unknown } })?.error;
  const code = typeof error?.code === "string" ? error.code : undefined;
  if (code === "secret_key_required") {
    return "this needs a key with more permissions.";
  }
  return code ? `request failed (${code}).` : undefined;
}

function itemFor(link: StripePaymentLink, testMode: boolean): SourceItem {
  const lines = link.line_items?.data ?? [];
  const [first] = lines;
  const title =
    first?.description?.trim() ||
    first?.price?.nickname?.trim() ||
    link.metadata?.name?.trim() ||
    "Payment link";
  const extra = lines.length > 1 ? ` + ${lines.length - 1} more` : "";
  const total = lines.reduce((sum, line) => sum + (line.amount_total ?? 0), 0);
  const currency = first?.currency ?? link.currency;
  const recurring = first?.price?.recurring?.interval;
  const price =
    currency && lines.length > 0
      ? `${formatMoney(total, currency)}${recurring ? ` / ${recurring}` : ""}`
      : undefined;
  return {
    id: link.id,
    title: `${title}${extra}`,
    subtitle: price,
    url: link.url,
    badge: testMode ? "Test mode" : undefined,
  };
}

/**
 * Stripe Payment Links, read with a restricted key that only has
 * "Payment Links: Read". Lists active links; the QR code encodes link.url.
 */
export class StripeClient implements ContentSourceClient {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private request<T>(path: string): Promise<T> {
    return providerRequest<T>(PROVIDER, `${BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
      describeError: describeStripeError,
    });
  }

  listPaymentLinks(
    params: { startingAfter?: string; limit?: number } = {}
  ): Promise<StripeList<StripePaymentLink>> {
    const search = new URLSearchParams({
      active: "true",
      limit: String(Math.min(Math.max(params.limit ?? PAGE_SIZE, 1), 100)),
    });
    search.append("expand[]", "data.line_items");
    if (params.startingAfter) {
      if (!CURSOR.test(params.startingAfter)) {
        throw new IntegrationApiError({
          provider: PROVIDER.slug,
          status: 400,
          code: "bad_request",
          message: "Stripe cursor is invalid.",
        });
      }
      search.set("starting_after", params.startingAfter);
    }
    return this.request(`/payment_links?${search.toString()}`);
  }

  /** One cheap call that proves the key can read payment links. */
  async verify(): Promise<{ testMode: boolean }> {
    await this.request("/payment_links?limit=1");
    return { testMode: isStripeTestKey(this.apiKey) };
  }

  async list(options: ListSourceOptions = {}): Promise<SourcePage> {
    const page = await this.listPaymentLinks({ startingAfter: options.cursor });
    const testMode = isStripeTestKey(this.apiKey);
    const items = page.data
      .filter((link) => link.active && link.url)
      .map((link) => itemFor(link, testMode));
    const last = page.data.at(-1);
    return {
      items: filterSourceItems(items, options.search),
      nextCursor: page.has_more && last ? last.id : undefined,
    };
  }
}

export function createStripeClient(apiKey: string): StripeClient {
  return new StripeClient(apiKey);
}
