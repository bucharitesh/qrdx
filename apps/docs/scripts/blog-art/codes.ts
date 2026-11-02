// The blog's illustrations: where each one is written, its size, and the
// real QR codes it carries (what they encode, and the showcase style that
// draws them). generate.ts bakes them into public/blog/<post>/<name>.svg and
// tests/blog-art.test.ts checks that every baked code decodes to `value`.
//
// Codes link to the qrdx.dev page the post is about, so a scan from a
// screenshot lands somewhere useful. Wi-Fi codes use a made-up network.

import type { ArtCode } from "./kit";

export interface BlogArt {
  /** Written to public/blog/<file>.svg */
  file: string;
  /** viewBox width and height; files are drawn at 10/3 of this. */
  size: readonly [number, number];
  codes: ArtCode[];
  /**
   * A patch (in the code's own 0–1000 units) that the scene hides, for the
   * error-correction figure: the code must still decode with it covered.
   */
  damage?: { id: string; x: number; y: number; w: number; h: number };
}

const COVER = [480, 270] as const;

const url = (path: string) => `https://qrdx.dev${path}`;

export const BLOG_ART = {
  // New posts
  dynamicCover: {
    file: "dynamic-vs-static-qr-codes/cover",
    size: COVER,
    codes: [{ id: "code", value: url("/guarantee"), style: "classic" }],
  },
  sizeCover: {
    file: "how-big-should-a-qr-code-be/cover",
    size: COVER,
    codes: [{ id: "code", value: url("/tools/print-size"), style: "classic" }],
  },
  apiCover: {
    file: "qr-code-api-guide/cover",
    size: COVER,
    codes: [
      {
        id: "code",
        value: url("/docs/developers/image-api"),
        style: "signature",
      },
    ],
  },
  menuCover: {
    file: "qr-codes-for-restaurant-menus/cover",
    size: COVER,
    codes: [
      { id: "code", value: url("/qr-codes-on/menus"), style: "classic" },
      {
        id: "wifi",
        value: "WIFI:T:WPA;S:Cafe Guest;P:espresso-2026;;",
        style: "facet",
      },
    ],
  },
  // Existing posts
  understandingCover: {
    file: "understanding-qr-codes/cover",
    size: COVER,
    codes: [
      {
        id: "code",
        value: url("/blog/understanding-qr-codes"),
        style: "classic",
      },
    ],
  },
  expireCover: {
    file: "do-qr-codes-expire/cover",
    size: COVER,
    codes: [{ id: "code", value: url("/guarantee"), style: "classy" }],
  },
  bestFreeCover: {
    file: "best-free-qr-code-generators-2026/cover",
    size: COVER,
    codes: [
      { id: "c1", value: url("/playground"), style: "classic" },
      { id: "c2", value: url("/playground"), style: "dots" },
      { id: "c3", value: url("/playground"), style: "fluid" },
      { id: "c4", value: url("/playground"), style: "classy" },
    ],
  },
  introCover: {
    file: "introducing-qrdx/cover",
    size: COVER,
    codes: [
      { id: "plain", value: url("/"), style: "classic" },
      { id: "styled", value: url("/"), style: "signature" },
    ],
  },
  integrationsCover: {
    file: "introducing-qrdx-integrations/cover",
    size: COVER,
    codes: [{ id: "code", value: url("/integrations"), style: "classic" }],
  },
  // Inline figures
  introStyles: {
    file: "introducing-qrdx/ai-styles",
    size: [480, 320],
    codes: [
      { id: "c1", value: url("/ai"), style: "fluid" },
      { id: "c2", value: url("/ai"), style: "dots" },
      { id: "c3", value: url("/ai"), style: "signature" },
    ],
  },
  introLayers: {
    file: "introducing-qrdx/layers",
    size: [480, 360],
    codes: [{ id: "code", value: url("/playground"), style: "classic" }],
  },
  introOpenSource: {
    file: "introducing-qrdx/open-source",
    size: [480, 320],
    codes: [{ id: "code", value: url("/docs/self-hosting"), style: "classic" }],
  },
  integrationsDub: {
    file: "introducing-qrdx-integrations/dub",
    size: [480, 320],
    codes: [{ id: "code", value: url("/integrations"), style: "classic" }],
  },
  integrationsDrive: {
    file: "introducing-qrdx-integrations/drive",
    size: [480, 320],
    codes: [
      { id: "code", value: url("/integrations"), style: "classic", level: "H" },
    ],
    // The centre logo: about 6% of the code, inside level H's budget.
    damage: { id: "code", x: 380, y: 380, w: 240, h: 240 },
  },
  integrationsOauth: {
    file: "introducing-qrdx-integrations/oauth",
    size: [480, 270],
    codes: [{ id: "code", value: url("/integrations"), style: "classic" }],
  },
  integrationsExtensible: {
    file: "introducing-qrdx-integrations/extensible",
    size: [480, 360],
    codes: [{ id: "code", value: url("/integrations"), style: "classic" }],
  },
  bestFreePaywall: {
    file: "best-free-qr-code-generators-2026/paywall",
    size: [480, 320],
    codes: [{ id: "code", value: url("/pricing"), style: "classic" }],
  },
  bestFreeScanLimits: {
    file: "best-free-qr-code-generators-2026/scan-limits",
    size: [400, 400],
    codes: [{ id: "code", value: url("/guarantee"), style: "classic" }],
  },
  bestFreePersonas: {
    file: "best-free-qr-code-generators-2026/personas",
    size: [480, 320],
    codes: [
      { id: "c1", value: url("/playground"), style: "fluid" },
      { id: "c2", value: url("/docs/developers/image-api"), style: "classic" },
      { id: "c3", value: url("/qr-code-generator/url"), style: "classic" },
    ],
  },
  understandingErrors: {
    file: "understanding-qr-codes/error-correction",
    size: [480, 320],
    codes: [
      {
        id: "code",
        value: url("/blog/understanding-qr-codes"),
        style: "classic",
        level: "H",
      },
    ],
    // About 9% of the code's area, inside level H's ~30% recovery budget,
    // clear of the finder and alignment patterns a camera locks onto.
    damage: { id: "code", x: 320, y: 600, w: 300, h: 300 },
  },
  understandingPipeline: {
    file: "understanding-qr-codes/scan-pipeline",
    size: [560, 240],
    codes: [{ id: "code", value: url("/"), style: "classic" }],
  },
} satisfies Record<string, BlogArt>;

export type BlogArtId = keyof typeof BLOG_ART;
export const BLOG_ART_IDS = Object.keys(BLOG_ART) as BlogArtId[];
