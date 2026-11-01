/**
 * Every product event QRdx sends, with its properties. Names are snake_case
 * `object_action`; properties are ids, counts and coarse values (content type,
 * format, plan). Never emails, names, destination URLs, code contents or
 * search text: `track()` also strips anything that looks like them.
 *
 * Client events go through `track()` (lib/analytics/track.ts), server events
 * through `trackServer()` (lib/analytics/server.ts).
 */

/** How someone signed in (Better Auth's last-used login method). */
export type SignInMethod = "google" | "github" | "email-otp" | "unknown";

/** Where a QR was rendered or exported from. */
export type QrSource =
  | "playground"
  | "dashboard"
  | "type_tool"
  | "bulk_tool"
  | "ai_art";

type NoProps = Record<string, never>;

export interface AnalyticsEvents {
  // Auth
  sign_up: { method: SignInMethod };
  sign_in: { method: SignInMethod };
  sign_out: NoProps;

  // QR codes
  qr_generated: { content_type: string; source: QrSource; count?: number };
  qr_downloaded: { format: string; source: QrSource; content_type?: string };
  qr_copied: { format: "svg"; source: QrSource };

  // Themes and AI
  theme_applied: { method: "preset" | "shuffle"; preset?: string };
  ai_theme_generated: { status: "success" | "fail" };
  theme_saved: NoProps;
  theme_shared: { saved: boolean };
  theme_save_failed: { operation: string; error_type: string };
  v0_opened: { saved: boolean };
  ai_art_generated: {
    visibility?: number;
    creativity?: number;
    variations?: number;
    locked_seed: boolean;
    reference: boolean;
    preset?: string;
  };
  prompt_enhance_started: {
    length: number;
    mention_count: number;
    image_count: number;
  };
  prompt_enhance_finished: { duration_ms?: number; length: number };
  prompt_enhance_failed: { code?: string; status?: number };
  prompt_enhance_canceled: { duration_ms?: number };

  // Dynamic codes and hosted pages
  dynamic_code_created: { source: "playground" | "dashboard" | "page" };
  page_published: { page_type?: string };
  /** Server side, from hosted pages: a count only, nothing about the visitor. */
  form_submitted: NoProps;
  template_used: { template_type: string };

  // Imports and integrations
  import_started: { provider: string; count: number };
  import_completed: { provider: string; count: number; failed?: number };
  integration_connected: { provider: string };

  // Developers
  oauth_app_created: NoProps;
  webhook_created: { event_count: number };
  mcp_connect_clicked: { client: string };
  plugin_install_clicked: { plugin: string; target: "store" | "source" };

  // Billing
  upgrade_clicked: { source: string; plan?: "pro" | "business" };
  checkout_started: { plan: "pro" | "business"; interval: "month" | "year" };
  /** Server side, from the Polar webhook. */
  subscription_activated: { plan: "pro" | "business"; interval?: string };

  // Docs and errors
  docs_search: { query_length: number; result_count?: number };
  "404_viewed": { area: "site" | "docs" };
  query_failed: { error_type: string };
}

export type AnalyticsEventName = keyof AnalyticsEvents;

/** Events the server sends (they may carry no browser context). */
export type ServerAnalyticsEventName =
  | "form_submitted"
  | "integration_connected"
  | "subscription_activated";

/** `track("sign_out")` for events without required properties. */
export type AnalyticsPropsArg<E extends AnalyticsEventName> =
  // biome-ignore lint/complexity/noBannedTypes: `{}` tests "all optional".
  {} extends AnalyticsEvents[E]
    ? [props?: AnalyticsEvents[E]]
    : [props: AnalyticsEvents[E]];

/** What survives sanitizing: flat primitives only. */
export type CleanProps = Record<string, string | number | boolean>;
