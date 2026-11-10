// Every link format into the playground, written with the shared helpers
// (playgroundHref, playgroundDesignHref, encodeStyleParam, packStyleParam)
// and read back with parsePlaygroundParams and decodeStyleParam. Then the
// links older pages, shares and agents already wrote, as plain strings, so a
// change to the writer can't quietly stop them loading.

import { OFFICIAL_FRAMES } from "qrdx";
import { describe, expect, it } from "vitest";
import { AI_ART_PRESETS } from "@/components/sections/ai-art/presets";
import {
  hasOneShotParams,
  type PlaygroundLinkOptions,
  type PlaygroundParams,
  parsePlaygroundParams,
  playgroundHref,
  stripOneShotParams,
  withHandoffRef,
} from "@/lib/playground-links";
import {
  decodeStyleParam,
  encodeStyleParam,
  playgroundDesignHref,
} from "@/lib/playground-style";
import { packStyleParam } from "@/lib/playground-style-pack";
import { CONTENT_TYPE_IDS } from "@/types/content-type-ids";
import { CONTENT_TYPES_METADATA } from "@/types/qr-content";
import type { ThemeStyles } from "@/types/theme";
import { defaultPresets } from "@/utils/qr-presets";

const ORIGIN = "https://qrdx.dev";

const read = (href: string) => {
  const url = new URL(href, ORIGIN);
  return {
    path: url.pathname,
    params: parsePlaygroundParams(url.search, url.hash),
    style: decodeStyleParam(url.searchParams.get("style")),
  };
};

const DESIGN: ThemeStyles = {
  bgColor: "#ffffff",
  fgColor: {
    type: "linear",
    angle: 45,
    stops: [
      { color: "#0b0b0d", offset: 0 },
      { color: "#155dfc", offset: 100 },
    ],
  },
  eyeColor: "#0b0b0d",
  dotColor: "#155dfc",
  bodyPattern: "liquid",
  cornerEyePattern: "squircle",
  cornerEyeDotPattern: "squircle",
  level: "Q",
  frame: { style: "banner-bottom", text: "Scan me", color: "#0b0b0d" },
};
const STYLE = encodeStyleParam(DESIGN)?.value ?? "";
const AI_STYLE = AI_ART_PRESETS[0]?.id ?? "";

describe("round trips: build a link, read it back", () => {
  const cases: [string, PlaygroundLinkOptions, PlaygroundParams][] = [
    ["the bare playground", {}, {}],
    ["a built-in preset", { preset: "classic" }, { preset: "classic" }],
    ["a style", { style: STYLE }, { style: STYLE }],
    [
      "a web address (after the #)",
      { url: "https://example.com/menu" },
      { type: "url", url: "https://example.com/menu" },
    ],
    ["a content type", { type: "wifi" }, { type: "wifi" }],
    [
      "a content type with QRdx's sample",
      { type: "wifi", sample: true },
      { type: "wifi", sample: true },
    ],
    [
      "the URL type with QRdx's sample",
      { type: "url", sample: true },
      { type: "url", sample: true },
    ],
    [
      "a tab alias and a Design section",
      { tab: "design", section: "frame" },
      { tab: "customisations", section: "frame" },
    ],
    ["the Generate tab alias", { tab: "generate" }, { tab: "ai" }],
    ["the download dialog", { open: "download" }, { open: "download" }],
    [
      "Get code on a tab",
      { open: "code", lang: "react" },
      { open: "code", lang: "react" },
    ],
    [
      "a print width",
      { print: { size: 40, unit: "mm" } },
      { open: "print", print: { size: 40, unit: "mm" } },
    ],
    [
      "a scan distance",
      { printDistance: { value: 1, unit: "m" } },
      { open: "print", printDistance: { value: 1, unit: "m" } },
    ],
    ["an Art mode", { art: "image" }, { tab: "art", art: "image" }],
    [
      "AI art with a style preset",
      { art: "ai", artStyle: AI_STYLE },
      { tab: "art", art: "ai", artStyle: AI_STYLE },
    ],
    [
      "open=dynamic with an address",
      { open: "dynamic", url: "https://example.com/" },
      { open: "dynamic", type: "url", url: "https://example.com/" },
    ],
    [
      "a marketing example: style, type and sample",
      { style: STYLE, type: "upi", sample: true },
      { style: STYLE, type: "upi", sample: true },
    ],
    [
      "an Art example on its look",
      { art: "logo", style: STYLE },
      { tab: "art", art: "logo", style: STYLE },
    ],
  ];

  it.each(cases)("%s", (_name, options, expected) => {
    const { path, params } = read(playgroundHref(options));
    expect(path).toBe("/playground");
    expect(params).toEqual(expected);
  });

  it("a saved or community theme path keeps its id and drops preset and style", () => {
    const href = playgroundHref({
      themeId: "abc123",
      tab: "design",
      preset: "classic",
      style: STYLE,
    });
    expect(href).toBe("/playground/abc123?tab=design");
    expect(read(href)).toMatchObject({
      path: "/playground/abc123",
      params: { tab: "customisations" },
    });
  });

  it("a hand-off tag rides along without changing what the link applies", () => {
    const href = playgroundHref({ type: "wifi", sample: true, preset: "mint" });
    expect(read(withHandoffRef(href, "home")).params).toEqual(
      read(href).params,
    );
  });

  it("a link that asks for nothing a link may carry stays bare", () => {
    expect(
      playgroundHref({
        url: "javascript:alert(1)",
        preset: "shuffle-1",
        style: "2.nope",
        sample: true,
      }),
    ).toBe("/playground");
  });
});

describe("designs survive the trip", () => {
  it("encodeStyleParam → link → decodeStyleParam gives the design back", () => {
    const { style } = read(playgroundHref({ style: STYLE }));
    expect(style?.styles).toEqual(DESIGN);
  });

  it("packStyleParam (no validator) reads back like encodeStyleParam", () => {
    expect(decodeStyleParam(packStyleParam(DESIGN))).toEqual({
      styles: DESIGN,
    });
    expect(decodeStyleParam(packStyleParam(DESIGN, "classic"))).toEqual(
      decodeStyleParam(encodeStyleParam(DESIGN, { preset: "classic" })?.value),
    );
    // Fields a link never carries are left out, not sent.
    const withLogo: ThemeStyles = { ...DESIGN, customLogo: "data:x" };
    expect(packStyleParam(withLogo)).toBe(packStyleParam(DESIGN));
  });

  it("playgroundDesignHref sends a preset as it ships, and a changed preset as a style", () => {
    expect(
      playgroundDesignHref({ preset: "mint", type: "wifi", sample: true }),
    ).toBe("/playground?type=wifi&sample=1&preset=mint");

    const mint = defaultPresets.mint?.styles ?? {};
    const framed: ThemeStyles = {
      ...mint,
      frame: { style: "rounded-border", text: "Free Wi-Fi", color: "#111111" },
    };
    const { params, style } = read(
      playgroundDesignHref({
        preset: "mint",
        design: framed,
        type: "wifi",
        sample: true,
      }),
    );
    expect(params.preset).toBeUndefined();
    expect(params).toMatchObject({ type: "wifi", sample: true });
    expect(style?.preset).toBe("mint");
    expect(style?.styles.frame).toEqual(framed.frame);
    expect(style?.styles.bodyPattern).toBe(mint.bodyPattern);
  });

  it("official frames travel by id and come back with their exact spec", () => {
    for (const official of OFFICIAL_FRAMES) {
      const frame = { style: "custom" as const, spec: official.spec };
      const encoded = encodeStyleParam({ frame });
      expect(encoded?.value.length, official.id).toBeLessThan(200);
      expect(
        decodeStyleParam(encoded?.value)?.styles.frame,
        official.id,
      ).toEqual(frame);
    }
    // With the frame's own colors and labels, as the sample codes set them.
    const labelled = {
      style: "custom" as const,
      spec: OFFICIAL_FRAMES[0]?.spec,
      color: "#111111",
      textColor: "#ffffff",
      text: "Free Wi-Fi",
    } as ThemeStyles["frame"];
    expect(
      decodeStyleParam(encodeStyleParam({ frame: labelled })?.value)?.styles
        .frame,
    ).toEqual(labelled);
  });

  it("an official frame's full spec, as older links carried it, still decodes", () => {
    const official = OFFICIAL_FRAMES[0];
    const frame = { style: "custom" as const, spec: official?.spec };
    const old = packStyleParam({ frame } as ThemeStyles);
    expect(old.length).toBeGreaterThan(500);
    expect(decodeStyleParam(old)?.styles.frame).toEqual(frame);
  });

  it("rejects an official frame id that's unknown or doubled with a spec", () => {
    const raw = (compact: object) =>
      `1.${Buffer.from(JSON.stringify(compact)).toString("base64url")}`;
    const spec = OFFICIAL_FRAMES[0]?.spec;
    expect(decodeStyleParam(raw({ of: "nope", r: { style: "custom" } }))).toBe(
      null,
    );
    expect(
      decodeStyleParam(
        raw({ of: OFFICIAL_FRAMES[0]?.id, r: { style: "custom", spec } }),
      ),
    ).toBe(null);
    expect(decodeStyleParam(raw({ of: OFFICIAL_FRAMES[0]?.id }))).toBe(null);
    expect(
      decodeStyleParam(
        raw({ of: OFFICIAL_FRAMES[0]?.id, r: { style: "banner-bottom" } }),
      ),
    ).toBe(null);
  });

  it("playgroundDesignHref falls back to the preset when nothing can travel", () => {
    // An uploaded logo is never in a link, so this design has nothing to carry.
    expect(
      playgroundDesignHref({
        preset: "classic",
        design: { customLogo: "data:image/png;base64,AAAA" },
      }),
    ).toBe("/playground?preset=classic");
  });
});

describe("content type ids", () => {
  it("lists exactly the type picker's types, so every type can be linked", () => {
    expect([...CONTENT_TYPE_IDS].sort()).toEqual(
      CONTENT_TYPES_METADATA.map((meta) => meta.type).sort(),
    );
    for (const type of CONTENT_TYPE_IDS) {
      expect(read(playgroundHref({ type })).params, type).toEqual({ type });
    }
  });
});

describe("sample", () => {
  it("is a flag: only sample=1, only with a type, never over a web address", () => {
    const parse = (search: string) => parsePlaygroundParams(search);
    expect(parse("?type=wifi&sample=1")).toEqual({
      type: "wifi",
      sample: true,
    });
    expect(parse("?sample=1")).toEqual({});
    expect(parse("?type=wifi&sample=true")).toEqual({ type: "wifi" });
    expect(parse("?type=wifi&sample=QRdx")).toEqual({ type: "wifi" });
    expect(parse("?type=nope&sample=1")).toEqual({});
    expect(parse("?url=https://example.com&sample=1")).toEqual({
      type: "url",
      url: "https://example.com/",
    });
    expect(
      parsePlaygroundParams("?sample=1", "#url=https://example.com"),
    ).toEqual({ type: "url", url: "https://example.com/" });
  });

  it("never carries a value: a link with form fields still reads as the flag", () => {
    const params = parsePlaygroundParams(
      "?type=upi&sample=1&upiId=thief@bank&name=Thief",
    );
    expect(params).toEqual({ type: "upi", sample: true });
    expect(JSON.stringify(params)).not.toMatch(/thief/i);
  });

  it("is applied once and removed from the address", () => {
    const href = `${ORIGIN}${playgroundHref({ type: "wifi", sample: true })}`;
    expect(hasOneShotParams(read(href).params)).toBe(true);
    expect(stripOneShotParams(href)).toBe("/playground");
  });
});

describe("old links keep loading", () => {
  // Written by hand as older pages, share dialogs, the MCP server and the
  // plugins wrote them; none of these strings may stop reading the same.
  const OLD_STYLE =
    "1.eyJiIjoiI2ZmZmZmZiIsImYiOiIjMTExMTExIiwicCI6InJvdW5kZWQiLCJjIjoicm91bmRlZCIsIm8iOiJyb3VuZGVkIiwiayI6ImNsYXNzaWMifQ";

  it("an old share link: /playground?style=1.…", () => {
    const { params, style } = read(`/playground?style=${OLD_STYLE}`);
    expect(params).toEqual({ style: OLD_STYLE });
    expect(style).toEqual({
      styles: {
        bgColor: "#ffffff",
        fgColor: "#111111",
        bodyPattern: "rounded",
        cornerEyePattern: "rounded",
        cornerEyeDotPattern: "rounded",
      },
      preset: "classic",
    });
  });

  it("a built-in preset: /playground?preset=<id>", () => {
    expect(read("/playground?preset=halloweenPumpkin").params).toEqual({
      preset: "halloweenPumpkin",
    });
  });

  it("a web address after the #, and the older query form", () => {
    expect(
      read("/playground#url=https%3A%2F%2Fexample.com%2Fmenu").params,
    ).toEqual({ type: "url", url: "https://example.com/menu" });
    expect(read("/playground?url=https://example.com/menu").params).toEqual({
      type: "url",
      url: "https://example.com/menu",
    });
  });

  it("a tab and a section: /playground?tab=…&section=…", () => {
    expect(read("/playground?tab=design&section=logo").params).toEqual({
      tab: "customisations",
      section: "logo",
    });
    expect(
      read("/playground?tab=customisations&section=colors").params,
    ).toEqual({ tab: "customisations", section: "colors" });
    expect(read("/playground?tab=settings").params).toEqual({
      tab: "settings",
    });
    expect(read("/playground?tab=generate").params).toEqual({ tab: "ai" });
  });

  it("retired sections still open their new home", () => {
    expect(read("/playground?section=shape").params).toEqual({
      section: "frame",
    });
    expect(read("/playground?section=art").params).toEqual({ tab: "art" });
  });

  it("a content type without a sample, as generator pages link it", () => {
    expect(read("/playground?type=wifi").params).toEqual({ type: "wifi" });
    expect(read("/playground?type=wifi&ref=not-found").params).toEqual({
      type: "wifi",
    });
  });

  it("a saved theme path, dialogs and the Print tab", () => {
    expect(read("/playground/abc123").path).toBe("/playground/abc123");
    expect(read("/playground?open=code&lang=mcp").params).toEqual({
      open: "code",
      lang: "mcp",
    });
    expect(read("/playground?open=print&print=40mm").params).toEqual({
      open: "print",
      print: { size: 40, unit: "mm" },
    });
    expect(read("/playground?tab=art&art=ai&artStyle=nope").params).toEqual({
      tab: "art",
      art: "ai",
      artStyle: "nope",
    });
  });
});
