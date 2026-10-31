// Dev-only sample data for content-source pickers and data-out panels, so
// they can be tried and screenshotted without real Stripe/HubSpot/... apps or
// a signed-in user: add ?integrations-mock=1 (ignored outside `next dev`).
import type { SourceItem, SourcePage, SyncState } from "@repo/integrations";
import { isIntegrationsMock } from "@/lib/connected-accounts/mock";
import type { ScopedFormPage } from "./data";

export { isIntegrationsMock };

const SOURCE_ITEMS: Record<string, SourceItem[]> = {
  stripe: [
    { id: "plink_1", title: "Spring tasting menu", subtitle: "$45.00", url: "https://buy.stripe.com/test_spring" },
    { id: "plink_2", title: "Yoga class pass + 1 more", subtitle: "$120.00", url: "https://buy.stripe.com/test_yoga" },
    { id: "plink_3", title: "Monthly membership", subtitle: "€19.00 / month", url: "https://buy.stripe.com/test_member" },
    { id: "plink_4", title: "Donation", subtitle: "$10.00", url: "https://buy.stripe.com/test_donate", badge: "Test mode" },
  ],
  calcom: [
    { id: "1", title: "15 min intro call", subtitle: "15 min", url: "https://cal.com/ada/intro" },
    { id: "2", title: "Studio tour", subtitle: "45 min", url: "https://cal.com/ada/tour" },
    { id: "3", title: "Strategy session", subtitle: "60 min", url: "https://cal.com/ada/strategy" },
  ],
  calendly: [
    { id: "et-1", title: "Coffee chat", subtitle: "30 min", url: "https://calendly.com/ada/coffee" },
    { id: "et-2", title: "Product demo", subtitle: "45 min", url: "https://calendly.com/ada/demo" },
    { id: "et-3", title: "VIP consultation", subtitle: "60 min", url: "https://calendly.com/ada/vip", badge: "Secret link" },
  ],
  shopify: [
    { id: "gid://shopify/Product/1", title: "Ceramic pour-over set", subtitle: "$64.00", url: "https://shop.example.com/products/pour-over-set" },
    { id: "gid://shopify/Product/2", title: "Single-origin beans, 250 g", subtitle: "From $14.00", url: "https://shop.example.com/products/beans" },
    { id: "gid://shopify/Product/3", title: "Linen apron", subtitle: "$38.00", url: "https://shop.example.com/products/linen-apron" },
    { id: "gid://shopify/Product/4", title: "Gift card", subtitle: "From $25.00", url: "https://example.myshopify.com/products/gift-card", badge: "Not on your online store" },
  ],
  youtube: [
    { id: "dQw4w9WgXcQ", title: "How we roast our coffee", subtitle: "2026-10-24", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
    { id: "9bZkp7q19f0", title: "Latte art in 60 seconds", subtitle: "2026-10-12", url: "https://www.youtube.com/watch?v=9bZkp7q19f0" },
    { id: "kJQP7kiw5Fk", title: "Behind the counter: a Saturday", subtitle: "2026-09-30", url: "https://www.youtube.com/watch?v=kJQP7kiw5Fk" },
  ],
  spotify: [
    { id: "37i9dQZF1DXcBWIGoYBM5M", title: "Café mornings", subtitle: "48 songs", url: "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M" },
    { id: "37i9dQZF1DX4sWSpwq3LiO", title: "Closing time", subtitle: "31 songs", url: "https://open.spotify.com/playlist/37i9dQZF1DX4sWSpwq3LiO" },
  ],
};

export function mockSourcePage(provider: string, search?: string): SourcePage {
  const items = SOURCE_ITEMS[provider] ?? [];
  const q = search?.trim().toLowerCase();
  return {
    items: q ? items.filter((item) => item.title.toLowerCase().includes(q)) : items,
  };
}

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();

export function mockSyncState(overrides: Partial<SyncState> = {}): SyncState {
  return {
    enabled: true,
    organizationId: null,
    cursor: { at: minutesAgo(4), id: "resp_9" },
    attempts: 0,
    nextAttemptAt: null,
    leaseUntil: null,
    status: "ok",
    lastError: null,
    lastAttemptAt: minutesAgo(4),
    lastSuccessAt: minutesAgo(4),
    delivered: 128,
    skipped: 3,
    ...overrides,
  };
}

export const MOCK_FORM_PAGES: ScopedFormPage[] = [
  {
    id: "page_spring",
    title: "Spring menu",
    forms: [
      {
        id: "form_newsletter",
        title: "Join our list",
        fields: [
          { id: "f_name", label: "Your name", type: "text" },
          { id: "f_email", label: "Email", type: "email" },
          { id: "f_phone", label: "Phone", type: "phone" },
          { id: "f_visit", label: "How did you hear about us?", type: "choice" },
          { id: "f_consent", label: "Send me news and offers", type: "consent" },
        ],
      },
    ],
  },
  {
    id: "page_event",
    title: "Open studio night",
    forms: [
      {
        id: "form_rsvp",
        title: "RSVP",
        fields: [
          { id: "r_first", label: "First name", type: "text" },
          { id: "r_last", label: "Last name", type: "text" },
          { id: "r_email", label: "Email address", type: "email" },
          { id: "r_company", label: "Company", type: "text" },
          { id: "r_rating", label: "Rate last year's event", type: "stars" },
        ],
      },
    ],
  },
];

export const MOCK_AUDIENCES = [
  { id: "a1b2c3d4e5", name: "Café newsletter", memberCount: 2140 },
  { id: "f6g7h8i9j0", name: "Studio events", memberCount: 380 },
];

export const MOCK_MERGE_FIELDS = [
  { tag: "FNAME", name: "First Name", type: "text" },
  { tag: "LNAME", name: "Last Name", type: "text" },
  { tag: "PHONE", name: "Phone Number", type: "phone" },
  { tag: "COMPANY", name: "Company", type: "text" },
];
