export interface StripeList<T> {
  object: "list";
  data: T[];
  has_more: boolean;
}

export interface StripeLineItem {
  id: string;
  description?: string | null;
  amount_total?: number;
  currency?: string;
  quantity?: number | null;
  price?: {
    id: string;
    nickname?: string | null;
    unit_amount?: number | null;
    recurring?: { interval?: string } | null;
  } | null;
}

export interface StripePaymentLink {
  id: string;
  object: "payment_link";
  active: boolean;
  url: string;
  livemode?: boolean;
  currency?: string;
  metadata?: Record<string, string>;
  line_items?: StripeList<StripeLineItem>;
}
