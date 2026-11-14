// Values the QRdx REST API accepts, copied from its OpenAPI document
// (https://qrdx.dev/openapi.json). This package can't import the app, so
// apps/app/tests/plugins/n8n-node.test.ts holds these lists to the API.

/** The hosted API; self-hosted copies set their own in the credential. */
export const DEFAULT_BASE_URL = "https://api.qrdx.dev/v1";

export const QR_IMAGE_FORMATS = ["png", "webp", "svg", "eps"] as const;
export type QrImageFormat = (typeof QR_IMAGE_FORMATS)[number];

/** `body`: shape of the data modules */
export const BODY_SHAPES = [
  "circle",
  "circle-large",
  "square",
  "diamond",
  "circle-mixed",
  "pacman",
  "rounded",
  "small-square",
  "vertical-line",
  "horizontal-line",
  "liquid",
  "liquid-horizontal",
  "liquid-vertical",
  "classy",
  "classy-rounded",
  "leaf",
  "plus",
  "hexagon",
  "star",
  "heart",
  "random-dots",
  "mosaic",
  "octagon",
] as const;

/** `eye`: shape of the three corner eye frames */
export const EYE_SHAPES = [
  "square",
  "rounded",
  "gear",
  "circle",
  "diya",
  "extra-rounded",
  "message",
  "pointy",
  "leaf",
  "drop",
  "octagon",
  "bevel",
  "squircle",
  "cushion",
  "shield",
  "petal",
  "leaf-reverse",
] as const;

/** `dot`: shape of the dot inside each corner eye */
export const EYE_DOT_SHAPES = [
  "square",
  "rounded",
  "circle",
  "message",
  "message-reverse",
  "diya",
  "diya-reverse",
  "rounded-triangle",
  "leaf",
  "drop",
  "plus",
  "cross-rounded",
  "hexagon",
  "octagon",
  "flower",
  "heart",
  "squircle",
  "dots",
  "extra-rounded",
  "leaf-reverse",
  "drop-reverse",
] as const;

/** `frame`: built-in call-to-action frames */
export const FRAMES = [
  "banner-bottom",
  "banner-top",
  "border",
  "rounded-border",
  "speech-bubble",
  "banner-top-bottom",
  "speech-bubble-top",
  "chat-bubble",
  "circle",
  "polaroid",
  "phone",
  "ticket",
  "badge",
  "envelope",
  "tag",
  "menu-card",
  "sticker",
  "gradient-border",
  "focus",
] as const;

/** `logoIcon`: quick logo icons QRdx draws in the centre */
export const LOGO_ICONS = [
  "wifi",
  "location",
  "phone",
  "email",
  "link",
  "file",
  "calendar",
  "whatsapp",
  "instagram",
] as const;

export const ERROR_CORRECTION_LEVELS = ["L", "M", "Q", "H"] as const;

export const QR_SIZE = { min: 64, max: 2048, default: 512 } as const;
export const QR_MARGIN = { min: 0, max: 16, default: 4 } as const;
export const FRAME_TEXT_MAX_LENGTH = 24;
export const DATA_MAX_LENGTH = 2048;

/** GET /codes `status` */
export const CODE_STATUSES = ["active", "archived", "all"] as const;
/** GET /codes `limit` maximum */
export const CODES_PAGE_SIZE = 100;

/** GET /codes/{id}/scans `range` */
export const SCAN_RANGES = ["7d", "30d", "90d", "365d", "1095d"] as const;
/** GET /codes/{id}/scans `limit` maximum */
export const SCANS_PAGE_SIZE = 500;

/** Events a hook can subscribe to (POST /hooks `events`). */
export const WEBHOOK_EVENTS = [
  "scan.created",
  "scan.milestone",
  "code.created",
  "code.updated",
  "form.submitted",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/** Sent only by Send test in QRdx's webhook settings. */
export const PING_EVENT = "ping";

/** How far a signature's timestamp may be from now, as in QRdx's docs. */
export const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;
