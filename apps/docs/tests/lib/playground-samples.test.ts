// QRdx's sample content for `sample=1` links (lib/playground-samples.ts):
// every value passes its form's own validation, and none is contact or
// payment details, real or made up.

import { describe, expect, it } from "vitest";
import type { z } from "zod";
import {
  hasPlaygroundSample,
  PLAYGROUND_SAMPLES,
  playgroundSample,
} from "@/lib/playground-samples";
import * as schemas from "@/lib/validations/qr-content";
import { CONTENT_TYPES_METADATA, type ContentType } from "@/types/qr-content";
import { encodeQRContent, validateContent } from "@/utils/qr-content-encoder";

/** Each type's form schema (lib/validations/qr-content.ts). */
const SCHEMA: Partial<Record<ContentType, z.ZodType>> = {
  url: schemas.urlSchema,
  text: schemas.textSchema,
  wifi: schemas.wifiSchema,
  maps: schemas.mapsSchema,
  facebook: schemas.facebookSchema,
  instagram: schemas.instagramSchema,
  reddit: schemas.redditSchema,
  tiktok: schemas.tiktokSchema,
  twitter: schemas.twitterSchema,
  linkedin: schemas.linkedinSchema,
  youtube: schemas.youtubeSchema,
  pinterest: schemas.pinterestSchema,
  snapchat: schemas.snapchatSchema,
  threads: schemas.threadsSchema,
  spotify: schemas.spotifySchema,
  "google-review": schemas.googleReviewSchema,
  amazon: schemas.amazonSchema,
  flipkart: schemas.flipkartSchema,
};

/** Types whose content is contact or payment details, or a stranger's handle. */
const NEVER_SAMPLED: ContentType[] = [
  "email",
  "phone",
  "sms",
  "whatsapp",
  "vcard",
  "upi",
  "paypal",
  "venmo",
  "bitcoin",
  "ethereum",
  "etsy",
  "calcom",
  "attendance",
  "dubsh",
  "google-drive",
];

const sampled = Object.entries(PLAYGROUND_SAMPLES) as [
  ContentType,
  (typeof PLAYGROUND_SAMPLES)[keyof typeof PLAYGROUND_SAMPLES],
][];

describe("playground samples", () => {
  it("cover every content type except the personal ones", () => {
    const all = CONTENT_TYPES_METADATA.map((meta) => meta.type);
    for (const type of all) {
      expect(hasPlaygroundSample(type), type).toBe(
        !NEVER_SAMPLED.includes(type),
      );
    }
  });

  it.each(sampled)(
    "%s passes its form's validation and encodes",
    (type, sample) => {
      expect(sample.type).toBe(type);
      expect(playgroundSample(type)).toBe(sample);
      const { type: _type, ...fields } = sample;
      const schema = SCHEMA[type];
      expect(schema, `${type} needs its schema here`).toBeDefined();
      expect(schema?.safeParse(fields).success, type).toBe(true);
      expect(validateContent(sample), type).toEqual({ valid: true });
      expect(encodeQRContent(sample), type).not.toBe("");
    },
  );

  it("hold no contact or payment details", () => {
    const text = JSON.stringify(PLAYGROUND_SAMPLES);
    // No email addresses, phone numbers, payment handles or wallets.
    expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    expect(text).not.toMatch(/\+?\d[\d\s-]{7,}\d/);
    expect(text).not.toMatch(/paypal|venmo|upi|bitcoin|0x[0-9a-f]{8}/i);
    // Web addresses are example.com or the platform's own site.
    for (const [address] of text.matchAll(/https?:\/\/[^"]+/g)) {
      const host = new URL(address).hostname;
      expect(host, address).toMatch(
        /^(example\.com|www\.(facebook|linkedin|youtube|amazon|flipkart)\.com|open\.spotify\.com)$/,
      );
    }
  });

  it("give no sample for the personal types", () => {
    for (const type of NEVER_SAMPLED) {
      expect(playgroundSample(type), type).toBeUndefined();
    }
  });
});
