// Run: cd apps/docs && DATABASE_URL=postgres://test@127.0.0.1:1/test \
//   npx tsx --conditions=react-server --test lib/redirect/routing.test.ts
// (no database connection is made; the URL only satisfies lib/env)
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { preferredLanguage, visitorHash } from "@/lib/scans";
import type { RedirectCode } from "./code";
import {
  appendQueryParams,
  BUCKET_RANGE,
  evaluateRouting,
  finalizeUrl,
  inSchedule,
  pickVariant,
  pixelConfigSchema,
  type RoutingConfigInput,
  type RoutingContext,
  type RoutingInput,
  resolveDestination,
  routingConfigSchema,
  SCAN_TOKEN_PARAM,
  scanVariantKey,
  signScanToken,
  splitBreakdownPlans,
  splitBucket,
  splitThresholds,
  utmConfigSchema,
  verifyScanToken,
} from "./routing";

const DEFAULT = "https://example.com/";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const PIXEL =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";
const MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const config = (input: RoutingConfigInput) => routingConfigSchema.parse(input);

const input = (overrides: Partial<RoutingInput> = {}): RoutingInput => ({
  deviceType: "mobile",
  os: "iOS",
  country: "US",
  region: "CA",
  language: "en-us",
  now: new Date("2026-10-30T15:00:00Z"), // Friday
  scanNumber: 1,
  visitorKey: "visitor-a",
  ...overrides,
});

const code = (overrides: Partial<RedirectCode> = {}): RedirectCode => ({
  id: "ccode00000000000000000001",
  slug: "aB3dE5f",
  kind: "redirect",
  destinationUrl: DEFAULT,
  domainId: null,
  isActive: true,
  archivedAt: null,
  deletedAt: null,
  scanCount: 0,
  passwordHash: null,
  startsAt: null,
  expiresAt: null,
  scanLimit: null,
  pausedAt: null,
  fallbackUrl: null,
  routing: null,
  utm: null,
  pixels: null,
  ...overrides,
});

const request = (headers: Record<string, string>) =>
  new Request("https://qrdx.dev/q/aB3dE5f", { headers });

const appLink = config({
  rules: [
    {
      id: "ios",
      conditions: [{ type: "os", os: ["iOS"] }],
      action: { type: "redirect", url: "https://apps.apple.com/app/id1" },
    },
    {
      id: "android",
      conditions: [{ type: "os", os: ["Android"] }],
      action: {
        type: "redirect",
        url: "https://play.google.com/store/apps/details?id=app",
      },
    },
  ],
});

describe("evaluateRouting", () => {
  it("first matching rule wins; no match falls back", () => {
    assert.equal(
      evaluateRouting(appLink, input(), DEFAULT).url,
      "https://apps.apple.com/app/id1",
    );
    assert.equal(
      evaluateRouting(appLink, input({ os: "Android" }), DEFAULT).rule?.id,
      "android",
    );
    const none = evaluateRouting(appLink, input({ os: "Windows" }), DEFAULT);
    assert.equal(none.rule, null);
    assert.equal(none.url, DEFAULT);
  });

  it("skips disabled rules and requires every condition", () => {
    const rules = config({
      rules: [
        {
          id: "off",
          enabled: false,
          action: { type: "redirect", url: "https://off.example/" },
        },
        {
          id: "us-mobile",
          conditions: [
            { type: "country", countries: ["us"] },
            { type: "device", devices: ["mobile"] },
          ],
          action: { type: "redirect", url: "https://us.example/" },
        },
      ],
    });
    assert.equal(
      evaluateRouting(rules, input(), DEFAULT).rule?.id,
      "us-mobile",
    );
    assert.equal(
      evaluateRouting(rules, input({ deviceType: "desktop" }), DEFAULT).rule,
      null,
    );
  });

  it("supports negated conditions, regions, languages and scan counts", () => {
    const rules = config({
      rules: [
        {
          id: "not-us",
          conditions: [{ type: "country", countries: ["US"], not: true }],
          action: { type: "redirect", url: "https://intl.example/" },
        },
        {
          id: "california",
          conditions: [{ type: "region", regions: ["US-CA"] }],
          action: { type: "redirect", url: "https://ca.example/" },
        },
        {
          id: "spanish",
          conditions: [{ type: "language", languages: ["es"] }],
          action: { type: "redirect", url: "https://es.example/" },
        },
        {
          id: "first-100",
          conditions: [{ type: "scans", operator: "first", count: 100 }],
          action: { type: "redirect", url: "https://early.example/" },
        },
      ],
    });
    const route = (overrides: Partial<RoutingInput>) =>
      evaluateRouting(rules, input(overrides), DEFAULT).rule?.id ?? null;
    assert.equal(route({ country: "DE" }), "not-us");
    assert.equal(route({ country: null }), "not-us");
    assert.equal(route({}), "california");
    assert.equal(route({ region: "NY", language: "es-mx" }), "spanish");
    assert.equal(route({ region: "NY", scanNumber: 100 }), "first-100");
    assert.equal(route({ region: "NY", scanNumber: 101 }), null);
  });

  it("checks date ranges as [from, to)", () => {
    const rules = config({
      rules: [
        {
          id: "sale",
          conditions: [
            {
              type: "dates",
              from: "2026-11-27T00:00:00Z",
              to: "2026-11-30T00:00:00Z",
            },
          ],
          action: { type: "redirect", url: "https://sale.example/" },
        },
      ],
    });
    const at = (iso: string) =>
      evaluateRouting(rules, input({ now: new Date(iso) }), DEFAULT).rule?.id;
    assert.equal(at("2026-11-27T00:00:00Z"), "sale");
    assert.equal(at("2026-11-29T23:59:59Z"), "sale");
    assert.equal(at("2026-11-30T00:00:00Z"), undefined);
  });

  it("rejects invalid configs", () => {
    const bad = (value: unknown) =>
      assert.equal(
        routingConfigSchema.safeParse(value).success,
        false,
        JSON.stringify(value),
      );
    bad({
      rules: [
        { id: "a", action: { type: "redirect", url: "javascript:alert(1)" } },
      ],
    });
    bad({
      rules: [
        {
          id: "a",
          action: { type: "redirect", url: "https://u:p@x.example/" },
        },
      ],
    });
    bad({
      rules: [
        { id: "a", action: { type: "redirect", url: "https://a.example/" } },
        { id: "a", action: { type: "redirect", url: "https://b.example/" } },
      ],
    });
    bad({
      rules: [
        {
          id: "a",
          conditions: [{ type: "country", countries: ["USA"] }],
          action: { type: "redirect", url: "https://a.example/" },
        },
      ],
    });
    bad({
      rules: [
        {
          id: "a",
          conditions: [
            {
              type: "schedule",
              days: [1],
              start: "09:00",
              end: "17:00",
              timeZone: "Mars/Olympus",
            },
          ],
          action: { type: "redirect", url: "https://a.example/" },
        },
      ],
    });
  });
});

describe("schedule", () => {
  const schedule = (days: number[], start: string, end: string) => ({
    type: "schedule" as const,
    days,
    start,
    end,
    timeZone: "America/New_York",
  });

  it("uses the rule's time zone", () => {
    // 15:00Z on Friday = 11:00 in New York (EDT)
    const at = new Date("2026-10-30T15:00:00Z");
    assert.equal(inSchedule(schedule([5], "09:00", "17:00"), at), true);
    assert.equal(inSchedule(schedule([5], "12:00", "17:00"), at), false);
    assert.equal(inSchedule(schedule([4], "09:00", "17:00"), at), false);
  });

  it("windows past midnight belong to the day they start", () => {
    // Saturday 01:00 in New York
    const at = new Date("2026-10-31T05:00:00Z");
    assert.equal(inSchedule(schedule([5], "22:00", "02:00"), at), true);
    assert.equal(inSchedule(schedule([6], "22:00", "02:00"), at), false);
  });

  it("start = end means all day", () => {
    const at = new Date("2026-10-30T03:00:00Z"); // Thursday 23:00 in New York
    assert.equal(inSchedule(schedule([4], "00:00", "00:00"), at), true);
  });
});

describe("A/B split", () => {
  const variants = [
    { id: "a", url: "https://a.example/", weight: 70 },
    { id: "b", url: "https://b.example/", weight: 30 },
  ];

  it("is sticky per visitor and follows the weights", () => {
    assert.equal(
      pickVariant("split", variants, "v1").id,
      pickVariant("split", variants, "v1").id,
    );
    let a = 0;
    for (let i = 0; i < 4000; i++) {
      if (pickVariant("split", variants, `visitor-${i}`).id === "a") a++;
    }
    assert.ok(a > 2600 && a < 3000, `70% expected, got ${a / 40}%`);
  });

  it("thresholds partition the bucket range", () => {
    const thresholds = splitThresholds(variants);
    assert.deepEqual(thresholds, [
      { id: "a", below: Math.floor(0.7 * BUCKET_RANGE) },
      { id: "b", below: BUCKET_RANGE },
    ]);
    const bucket = splitBucket("split", "v1");
    assert.ok(bucket >= 0 && bucket < BUCKET_RANGE);
  });

  it("replay plans know which scans reached the split", () => {
    const rules = config({
      rules: [
        {
          id: "ios",
          conditions: [{ type: "os", os: ["iOS"] }],
          action: { type: "redirect", url: "https://apps.apple.com/app/id1" },
        },
        {
          id: "split",
          action: { type: "split", variants },
        },
        {
          id: "late",
          action: {
            type: "split",
            variants: [
              { id: "x", url: "https://x.example/", weight: 1 },
              { id: "y", url: "https://y.example/", weight: 1 },
            ],
          },
        },
      ],
    });
    const [first, second] = splitBreakdownPlans(rules);
    assert.equal(first?.ruleId, "split");
    assert.equal(first?.variantPrefix, scanVariantKey("split", ""));
    assert.equal(first?.approximate, false);
    assert.equal(first?.unreachable, false);
    assert.ok(first?.where);
    assert.equal(second?.unreachable, true);

    const withLanguage = config({
      rules: [
        {
          id: "es",
          conditions: [{ type: "language", languages: ["es"] }],
          action: { type: "redirect", url: "https://es.example/" },
        },
        { id: "split", action: { type: "split", variants } },
      ],
    });
    assert.equal(splitBreakdownPlans(withLanguage)[0]?.approximate, true);
  });
});

describe("query parameters", () => {
  it("appends without clobbering or re-encoding", () => {
    assert.equal(
      appendQueryParams("https://x.example/p?a=1&utm_source=keep%20me#top", [
        ["utm_source", "qr"],
        ["utm_medium", "print ad"],
      ]),
      "https://x.example/p?a=1&utm_source=keep%20me&utm_medium=print%20ad#top",
    );
    assert.equal(
      appendQueryParams("https://x.example/", [["a", "b"]]),
      "https://x.example/?a=b",
    );
  });

  it("builds UTM parameters in order, skipping blanks", () => {
    const utm = utmConfigSchema.parse({
      source: "qr",
      medium: "",
      campaign: "fall",
      params: [{ key: "ref", value: "poster" }],
    });
    assert.equal(
      finalizeUrl("https://x.example/", { utm }),
      "https://x.example/?utm_source=qr&utm_campaign=fall&ref=poster",
    );
    assert.equal(
      utmConfigSchema.safeParse({ params: [{ key: "qrdx_sid", value: "x" }] })
        .success,
      false,
    );
  });
});

describe("pixel ids", () => {
  it("only accepts each provider's format", () => {
    assert.equal(
      pixelConfigSchema.safeParse({ ga4: "G-ABC123XYZ" }).success,
      true,
    );
    assert.equal(
      pixelConfigSchema.safeParse({ ga4: "G-1');alert(1);//" }).success,
      false,
    );
    assert.equal(pixelConfigSchema.safeParse({ meta: "12ab" }).success, false);
    assert.equal(pixelConfigSchema.parse({ gtm: "" }).gtm, undefined);
  });
});

describe("scan tokens", () => {
  const now = new Date("2026-10-30T12:00:00Z");
  const token = signScanToken(
    "cscan0000000000000000001",
    "ccode0000000000000000001",
    now,
  );

  it("round-trips and rejects tampering", () => {
    assert.deepEqual(verifyScanToken(token, now), {
      scanId: "cscan0000000000000000001",
      codeId: "ccode0000000000000000001",
      issuedAt: now,
    });
    const [scanId, , issued, signature] = token.split(".");
    assert.equal(
      verifyScanToken(
        `${scanId}.ccode0000000000000000002.${issued}.${signature}`,
        now,
      ),
      null,
    );
    assert.equal(verifyScanToken(`${token}x`, now), null);
    assert.equal(verifyScanToken(42, now), null);
  });

  it("expires after the attribution window", () => {
    const later = new Date(now.getTime() + 31 * 86_400_000);
    assert.equal(verifyScanToken(token, later), null);
  });
});

describe("resolveDestination", () => {
  const context = { scanId: "cscan0000000000000000001", now: new Date() };

  it("returns destination_url untouched without settings", async () => {
    assert.equal(
      await resolveDestination(code(), request({ "user-agent": MAC }), context),
      DEFAULT,
    );
  });

  it("routes by user agent and appends UTM + qrdx_sid", async () => {
    const routed = code({
      routing: appLink,
      utm: { source: "qr" },
      pixels: { conversions: true },
    });
    const url = new URL(
      await resolveDestination(
        routed,
        request({ "user-agent": PIXEL }),
        context,
      ),
    );
    assert.equal(
      url.origin + url.pathname,
      "https://play.google.com/store/apps/details",
    );
    assert.equal(url.searchParams.get("id"), "app");
    assert.equal(url.searchParams.get("utm_source"), "qr");
    const token = verifyScanToken(url.searchParams.get(SCAN_TOKEN_PARAM));
    assert.equal(token?.scanId, context.scanId);
    assert.equal(token?.codeId, routed.id);
  });

  it("ignores invalid stored settings", async () => {
    const broken = code({ routing: { rules: "nope" }, utm: 5 });
    assert.equal(
      await resolveDestination(
        broken,
        request({ "user-agent": IPHONE }),
        context,
      ),
      DEFAULT,
    );
  });

  it("assigns splits by the stored visitor hash", async () => {
    const split = code({
      routing: {
        rules: [
          {
            id: "ab",
            action: {
              type: "split",
              variants: [
                { id: "a", url: "https://a.example/", weight: 1 },
                { id: "b", url: "https://b.example/", weight: 1 },
              ],
            },
          },
        ],
      },
    });
    const headers = { "user-agent": MAC, "x-real-ip": "203.0.113.9" };
    const expected = pickVariant(
      "ab",
      [
        { id: "a", url: "https://a.example/", weight: 1 },
        { id: "b", url: "https://b.example/", weight: 1 },
      ],
      visitorHash("203.0.113.9", MAC, context.now),
    ).url;
    const served: RoutingContext = { ...context };
    assert.equal(
      await resolveDestination(split, request(headers), served),
      expected,
    );
    // The /q route stores this in qr_scan.variant when it records the scan.
    assert.equal(
      served.variant,
      scanVariantKey("ab", expected === "https://a.example/" ? "a" : "b"),
    );
  });

  it("leaves the variant unset when no split served the scan", async () => {
    const served: RoutingContext = { ...context };
    await resolveDestination(
      code({ routing: appLink }),
      request({ "user-agent": IPHONE }),
      served,
    );
    assert.equal(served.variant, undefined);
  });
});

describe("preferredLanguage", () => {
  it("picks the highest q value", () => {
    assert.equal(preferredLanguage("fr-CH, fr;q=0.9, en;q=0.8"), "fr-ch");
    assert.equal(preferredLanguage("en;q=0.5, de;q=0.9"), "de");
    assert.equal(preferredLanguage("*"), null);
    assert.equal(preferredLanguage(null), null);
  });
});
