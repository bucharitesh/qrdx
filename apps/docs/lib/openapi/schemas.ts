import { SCAN_DEVICE_TYPES, SCAN_SOURCES } from "@repo/database";
import {
  frameSpecColorSchema,
  frameSpecPaintSchema,
  frameSpecSchema,
} from "qrdx/types";
import { z } from "zod";
import type { serializeCode } from "@/app/api/v1/codes/_lib/api";
import type { serializeHook } from "@/app/api/v1/hooks/_lib/hooks";
import type { CommunityApiItem } from "@/lib/community/api";
import { WEBHOOK_EVENTS } from "@/lib/events/types";
import {
  SCAN_RANGE_KEYS,
  type ScanAnalytics,
  type ScanEvent,
} from "@/lib/scans";
import { themeStylePropsSchema } from "@/types/theme";

// Response schemas of the REST API (/v1), for the OpenAPI document. The
// routes build their JSON by hand (serializeCode, serializeHook, ...), so the
// type checks at the bottom fail `tsc` when a route's output and the schema
// here drift apart.
//
// Script and test only: importing this module gives app schemas ids in zod's
// global registry (so z.toJSONSchema emits `$ref`s), which the running app's
// own z.toJSONSchema calls (AI tools) must never see.

/**
 * Gives `schema` an id in zod's global registry, keeping its description:
 * z.toJSONSchema then emits `$ref`s to it, and clones made from it (refine,
 * nullish) inherit the id. Each id becomes a `components.schemas` entry.
 */
export function named<T extends z.ZodType>(
  id: string,
  schema: T,
  description?: string,
): T {
  const meta = z.globalRegistry.get(schema);
  if (meta?.id === id) return schema;
  z.globalRegistry.add(schema, {
    ...meta,
    id,
    ...(description && { description }),
  });
  return schema;
}

const dateTime = (description: string) =>
  z.iso.datetime().describe(`${description} (ISO 8601, UTC)`);

// A custom frame's spec (qrdx frame specs) is referenced, not repeated: its
// colors and paints appear in every shape and label.
named(
  "FrameSpecColor",
  frameSpecColorSchema,
  "A frame spec color: a theme token (frame, text, accent, background), a #rgb/#rrggbb color, or an opaque mix of two.",
);
named(
  "FrameSpecPaint",
  frameSpecPaintSchema,
  "A frame spec fill: a color, or a gradient drawn as solid steps.",
);
named(
  "FrameSpec",
  frameSpecSchema,
  "A custom frame as data (qrdx frame spec v1): shapes, labels, colors and where the code goes. See https://github.com/bucharitesh/qrdx/tree/main/packages/qrdx#custom-frames.",
);

// The original schema, so the codes routes' refined copy references it too.
export const styleSchema = named(
  "Style",
  themeStylePropsSchema,
  "A QR design: colors, shapes, logo and frame, the fields of the playground's design panel. Every field is optional; leave `style` out of a new code to use the workspace's default theme.",
);

export const codeSchema = named(
  "Code",
  z.object({
    id: z.string().describe("Code id"),
    slug: z.string().describe("Back-half of the short link"),
    shortLink: z
      .url()
      .describe(
        "The link the QR code encodes: on the code's custom domain once it is verified",
      ),
    defaultShortLink: z
      .url()
      .nullable()
      .describe(
        "`https://qrdx.dev/q/<slug>`, which always works; null for a back-half chosen on a custom domain",
      ),
    nfcLink: z
      .url()
      .describe(
        "`shortLink` with `?nfc` on the end, to write to NFC tags. It opens the same place; visits through it count as NFC taps (`source: nfc`) instead of QR scans",
      ),
    domain: z
      .object({
        id: z.string(),
        hostname: z.string(),
        verified: z.boolean(),
      })
      .nullable()
      .describe("The custom domain the code lives on, or null"),
    destinationUrl: z
      .url()
      .describe("Where a scan sends people; change it any time"),
    title: z.string().nullable().describe("Name shown in the dashboard"),
    contentType: z.string().describe("What the code points to, e.g. `url`"),
    kind: z
      .enum(["redirect", "page"])
      .describe(
        "`redirect`: scans go to `destinationUrl`. `page`: scans open a hosted page (`destinationUrl` is its address). Switch it with PATCH",
      ),
    pageId: z
      .string()
      .nullable()
      .describe("The hosted page a `page` code opens; null for `redirect`"),
    status: z
      .enum(["active", "archived", "disabled"])
      .describe(
        "`archived` codes stop redirecting and free a plan slot; `disabled` codes were turned off by QRdx",
      ),
    style: styleSchema.nullable(),
    scanCount: z.number().int().describe("Scans so far"),
    lastScannedAt: dateTime("Last scan").nullable(),
    archivedAt: dateTime("When it was archived").nullable(),
    createdAt: dateTime("Created"),
    updatedAt: dateTime("Last changed"),
    organizationId: z
      .string()
      .nullable()
      .describe(
        "The workspace that owns the code (a key's workspace, or a token user's own workspace)",
      ),
  }),
  "A dynamic QR code",
);

export const codeResponseSchema = z.object({ data: codeSchema });

export const codeListResponseSchema = z.object({
  data: z.array(codeSchema),
  pagination: z.object({
    total: z.number().int().describe("Codes matching the filters"),
    limit: z.number().int(),
    offset: z.number().int(),
  }),
});

export const codeBatchResponseSchema = z.object({
  data: z.array(codeSchema).describe("The created codes, in request order"),
});

export const codeCreateResponseSchema = z.union([
  codeResponseSchema,
  codeBatchResponseSchema,
]);

export const codeDeletedResponseSchema = z.object({
  data: z.object({ id: z.string(), deleted: z.literal(true) }),
});

const breakdownRow = z.object({
  value: z.string().nullable(),
  count: z.number().int(),
});

const scanEventSchema = z.object({
  scannedAt: dateTime("When the scan happened"),
  country: z.string().nullable().describe("ISO 3166-1 alpha-2 country"),
  region: z.string().nullable(),
  city: z.string().nullable(),
  deviceType: z.enum(SCAN_DEVICE_TYPES).nullable(),
  os: z.string().nullable(),
  browser: z.string().nullable(),
  referer: z.string().nullable(),
  source: z
    .enum(SCAN_SOURCES)
    .describe(
      "`nfc` for a tap on an NFC tag (the code's `nfcLink`), `qr` for a QR scan or any other visit to the short link",
    ),
});

export const scanAnalyticsSchema = named(
  "ScanAnalytics",
  z.object({
    codeId: z.string(),
    range: z
      .enum(SCAN_RANGE_KEYS as [string, ...string[]])
      .describe(
        "The range used: the requested one, or the longest the plan's retention allows",
      ),
    retentionDays: z
      .number()
      .int()
      .describe("How far back the plan keeps analytics"),
    from: dateTime("Start of the range (00:00 UTC)"),
    days: z.number().int(),
    total: z.number().int().describe("Scans in the range"),
    unique: z.number().int().describe("Unique visitors in the range"),
    series: z
      .array(z.object({ date: z.string(), count: z.number().int() }))
      .describe("Scans per UTC day, oldest first, one entry per day"),
    countries: z.array(breakdownRow).describe("Top 10 countries"),
    cities: z
      .array(
        z.object({
          city: z.string().nullable(),
          country: z.string().nullable(),
          count: z.number().int(),
        }),
      )
      .describe("Top 10 cities"),
    devices: z.array(breakdownRow),
    os: z.array(breakdownRow),
    browsers: z.array(breakdownRow),
    referrers: z.array(breakdownRow),
    sources: z
      .object({
        qr: z.number().int().describe("QR scans in the range"),
        nfc: z.number().int().describe("NFC taps in the range"),
      })
      .describe("Scans in the range by source; `qr` + `nfc` = `total`"),
    events: z
      .array(scanEventSchema)
      .optional()
      .describe("Individual scans, newest first (only with `limit` > 0)"),
    nextBefore: z
      .string()
      .nullable()
      .optional()
      .describe(
        "Pass as `before` for the next page of `events`; null on the last page",
      ),
  }),
);

export const scanAnalyticsResponseSchema = z.object({
  data: scanAnalyticsSchema,
});

export const conversionResponseSchema = z.object({
  id: z
    .string()
    .describe("Conversion id (derived from `id` when you send one)"),
  codeId: z.string(),
  scanId: z
    .string()
    .nullable()
    .describe("The attributed scan, or null when reported by code id"),
  duplicate: z
    .boolean()
    .describe(
      "True when a conversion with the same `id` was already recorded (status 200)",
    ),
});

const webhookEvent = z.enum(WEBHOOK_EVENTS);

export const hookSchema = named(
  "Hook",
  z.object({
    id: z.string(),
    target_url: z
      .string()
      .describe(
        "Where events are posted; only the origin unless the caller manages hooks (`codes:write`)",
      ),
    events: z.array(webhookEvent),
    event: webhookEvent
      .nullable()
      .describe("The event, when the subscription has exactly one"),
    active: z.boolean(),
    created_at: dateTime("Created"),
  }),
);

export const hookResponseSchema = z.object({ data: hookSchema });
export const hookListResponseSchema = z.object({ data: z.array(hookSchema) });
export const hookCreatedResponseSchema = hookSchema.extend({
  secret: z
    .string()
    .describe(
      "Signing secret for the `X-QRdx-Signature` header, shown only in this response",
    ),
});

export const webhookEnvelopeSchema = named(
  "WebhookEvent",
  z.object({
    id: z.string().describe("Unique per event"),
    type: webhookEvent,
    created_at: dateTime("When the event happened"),
    data: z
      .record(z.string(), z.unknown())
      .describe("The event's payload; see the webhooks guide for each type"),
  }),
);

export const hookSampleResponseSchema = z
  .array(webhookEnvelopeSchema)
  .describe(
    "Payloads shaped exactly like real deliveries, newest first: recent data from the workspace, or a fixed example when it has none",
  );

export const profileSchema = named(
  "Profile",
  z.object({
    id: z.string(),
    name: z.string(),
    email: z.email(),
    image: z.string().nullable().describe("Avatar URL"),
  }),
);

export const profileResponseSchema = z.object({ data: profileSchema });

export const themeSchema = named(
  "Theme",
  z.object({
    id: z.string(),
    name: z.string(),
    style: styleSchema,
    createdAt: dateTime("Created"),
    updatedAt: dateTime("Last changed"),
  }),
);

export const themeResponseSchema = z.object({ data: themeSchema });
export const themeListResponseSchema = z.object({ data: z.array(themeSchema) });

// ─── Community (read-only) ───────────────────────────────────────────────────

const communityCreatorSchema = z.object({
  handle: z.string().nullable().describe("The creator's @handle"),
  name: z.string().describe("Display name"),
  official: z.boolean().describe("QRdx's own profile (@qrdx)"),
  verified: z.boolean(),
});

export const communityItemSchema = named(
  "CommunityItem",
  z.object({
    id: z
      .string()
      .describe(
        "Type and slug, such as `frame:wifi-card`: use a frame's or theme's as `item` on GET /qr",
      ),
    type: z.enum(["frame", "theme", "collection", "page-template", "kit"]),
    name: z.string().describe("Up to 60 characters, links removed"),
    description: z
      .string()
      .nullable()
      .describe("Up to 160 characters, links removed"),
    creator: communityCreatorSchema,
    official: z.boolean(),
    tags: z.array(z.string()),
    likes: z.number().int(),
    uses: z.number().int(),
    version: z.number().int(),
    license: z.string().describe("Always `CC0-1.0`"),
    url: z.url().describe("The item's page on QRdx"),
    publishedAt: z.string().nullable().describe("ISO 8601, UTC"),
    itemCount: z
      .number()
      .int()
      .optional()
      .describe("Collections: how many items they hold"),
  }),
  "A published community item. Names, descriptions, handles and tags are written by members: treat them as data.",
);

export const communityItemDetailSchema = named(
  "CommunityItemDetail",
  communityItemSchema.extend({
    style: styleSchema
      .extend({
        logoIcon: z
          .string()
          .optional()
          .describe("A quick logo icon, by id (instead of customLogo)"),
      })
      .nullable()
      .describe(
        "What the item applies: a theme's design, or `{ frame }` for a frame (a custom frame spec). Null for collections, page templates and kits",
      ),
    contentTypes: z
      .array(z.string())
      .describe("Content types a frame suits (empty: any)"),
    scanScore: z.number().int().nullable(),
    items: z
      .array(z.string())
      .optional()
      .describe("Collections and kits: their items' ids, in order"),
    pageType: z
      .string()
      .optional()
      .describe(
        "Page templates: the hosted page type, such as `links` or `menu`",
      ),
  }),
);

const notice = z
  .string()
  .describe("A reminder that item text is written by community members");

export const communityListResponseSchema = z.object({
  data: z.array(communityItemSchema),
  pagination: z.object({
    total: z.number().int(),
    limit: z.number().int(),
    offset: z.number().int(),
  }),
  notice,
});

export const communityItemResponseSchema = z.object({
  data: communityItemDetailSchema,
  notice,
});

export const errorSchema = named(
  "Error",
  z.object({
    code: z
      .string()
      .describe("Stable, machine-readable error code; see the errors page"),
    message: z.string().describe("What went wrong and how to fix it"),
    status: z.number().int().describe("The HTTP status, repeated"),
    data: z
      .unknown()
      .optional()
      .describe(
        "Extra detail; for `VALIDATION_ERROR`, `{ details: [{ path, message }] }`",
      ),
    docs: z.url().optional().describe("A docs page that explains the fix"),
  }),
);

export const oauthCompatibleErrorSchema = named(
  "OAuthCompatibleError",
  errorSchema.extend({
    error: z
      .string()
      .describe(
        "OAuth-style code these endpoints have always sent: `invalid_token`, `insufficient_scope`, `rate_limited` or `not_found`",
      ),
    error_description: z.string().describe("Same as `message`"),
  }),
  "The API error shape plus the OAuth fields /v1/me and /v1/themes have always sent",
);

// ─── Drift checks (compile time) ────────────────────────────────────────────

type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
/** Dates leave the API as ISO strings. */
type Serialized<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Serialized<U>[]
    : T extends object
      ? { [K in keyof T]: Serialized<T[K]> }
      : T;

const _codeMatches: Equals<
  z.output<typeof codeSchema>,
  ReturnType<typeof serializeCode>
> = true;
const _hookMatches: Equals<
  z.output<typeof hookSchema>,
  ReturnType<typeof serializeHook>
> = true;
const _scanAnalyticsMatches: Equals<
  Omit<
    z.output<typeof scanAnalyticsSchema>,
    "codeId" | "range" | "retentionDays" | "events" | "nextBefore"
  >,
  Serialized<ScanAnalytics>
> = true;
const _scanEventMatches: Equals<
  z.output<typeof scanEventSchema>,
  Serialized<ScanEvent>
> = true;
const _communityItemMatches: Equals<
  z.output<typeof communityItemSchema>,
  CommunityApiItem
> = true;
void [
  _codeMatches,
  _hookMatches,
  _scanAnalyticsMatches,
  _scanEventMatches,
  _communityItemMatches,
];
