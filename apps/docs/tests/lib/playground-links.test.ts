// Playground links: the one writer (playgroundHref) and reader
// (parsePlaygroundParams). Only harmless state may travel; private content
// never does, and invalid values are dropped on both sides.

import { getQRModuleCount } from "qrdx";
import { describe, expect, it } from "vitest";
import { CODE_TABS } from "@/components/editor/action-bar/code-snippets";
import { AI_ART_PRESETS } from "@/components/sections/ai-art/presets";
import {
  CODE_LANGS,
  DESIGN_SECTIONS,
  formatPrintDistance,
  handoffSource,
  hasOneShotParams,
  MAX_LINK_URL_LENGTH,
  MAX_STYLE_PARAM_LENGTH,
  PRINT_DISTANCE_MAX_MM,
  PRINT_DISTANCE_MIN_MM,
  parseArtStyleId,
  parseLinkUrl,
  parsePlaygroundParams,
  parsePrintDistance,
  parsePrintWidth,
  playgroundHref,
  resolveControlTab,
  stripOneShotParams,
} from "@/lib/playground-links";
import {
  printTabForDistance,
  printWidthForScanDistance,
  scanDistanceForPrintWidth,
} from "@/lib/print-size";

const parseHref = (href: string) => {
  const url = new URL(href, "https://qrdx.dev");
  return parsePlaygroundParams(url.search, url.hash);
};

describe("tab aliases", () => {
  it("maps the friendly names to the stored tabs", () => {
    expect(resolveControlTab("design")).toBe("customisations");
    expect(resolveControlTab("generate")).toBe("ai");
    expect(resolveControlTab("Design")).toBe("customisations");
  });

  it("keeps the stored names, the legacy settings tab and rejects the rest", () => {
    expect(resolveControlTab("content")).toBe("content");
    expect(resolveControlTab("customisations")).toBe("customisations");
    expect(resolveControlTab("settings")).toBe("settings");
    expect(resolveControlTab("ai")).toBe("ai");
    expect(resolveControlTab("art")).toBe("art");
    expect(resolveControlTab("")).toBeNull();
    expect(resolveControlTab(null)).toBeNull();
  });

  it("parses aliases from a link", () => {
    expect(parseHref("/playground?tab=design").tab).toBe("customisations");
    expect(parseHref("/playground?tab=generate").tab).toBe("ai");
    expect(parseHref("/playground?tab=nope").tab).toBeUndefined();
  });
});

describe("url", () => {
  it("accepts http and https addresses", () => {
    expect(parseLinkUrl("https://example.com/menu?table=4")).toBe(
      "https://example.com/menu?table=4",
    );
    expect(parseLinkUrl("http://example.com")).toBe("http://example.com/");
  });

  it("rejects other schemes, credentials and junk", () => {
    expect(parseLinkUrl("javascript:alert(1)")).toBeNull();
    expect(parseLinkUrl("JavaScript:alert(1)")).toBeNull();
    expect(parseLinkUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(parseLinkUrl("file:///etc/passwd")).toBeNull();
    expect(parseLinkUrl("mailto:someone@example.com")).toBeNull();
    expect(parseLinkUrl("WIFI:T:WPA;S:Home;P:secret;;")).toBeNull();
    expect(parseLinkUrl("https://user:secret@example.com/")).toBeNull();
    expect(parseLinkUrl("https://user@example.com/")).toBeNull();
    expect(parseLinkUrl("example.com")).toBeNull();
    expect(parseLinkUrl("")).toBeNull();
  });

  it("rejects addresses over the length limit", () => {
    const base = "https://example.com/?q=";
    const fits = base + "a".repeat(MAX_LINK_URL_LENGTH - base.length);
    expect(parseLinkUrl(fits)).toBe(fits);
    expect(parseLinkUrl(`${fits}a`)).toBeNull();
  });

  it("implies the URL type and drops an address that conflicts with the type", () => {
    expect(parseHref("/playground?url=https://example.com")).toMatchObject({
      type: "url",
      url: "https://example.com/",
    });
    const wifi = parseHref("/playground?type=wifi&url=https://example.com");
    expect(wifi.type).toBe("wifi");
    expect(wifi.url).toBeUndefined();
    expect(parseHref("/playground?url=javascript:alert(1)")).toEqual({});
  });

  it("reads the address from the fragment, which wins over the query", () => {
    expect(
      parseHref("/playground?url=https://a.example#url=https%3A%2F%2Fb.example")
        .url,
    ).toBe("https://b.example/");
  });
});

describe("other parameters", () => {
  it("accepts known content types only", () => {
    expect(parseHref("/playground?type=wifi").type).toBe("wifi");
    expect(parseHref("/playground?type=vcard").type).toBe("vcard");
    expect(parseHref("/playground?type=hosted-pdf").type).toBeUndefined();
  });

  it("accepts preset ids by shape, never shuffles", () => {
    expect(parseHref("/playground?preset=classic").preset).toBe("classic");
    expect(parseHref("/playground?preset=halloweenPumpkin").preset).toBe(
      "halloweenPumpkin",
    );
    expect(parseHref("/playground?preset=shuffle-42").preset).toBeUndefined();
    expect(parseHref("/playground?preset=../x").preset).toBeUndefined();
  });

  it("opens only surfaces that exist today", () => {
    for (const target of [
      "download",
      "print",
      "code",
      "photo-check",
      "community",
    ]) {
      expect(parseHref(`/playground?open=${target}`).open).toBe(target);
    }
    // The Art tab comes in a later phase (open=dynamic: its own block below).
    for (const later of ["art"]) {
      expect(parseHref(`/playground?open=${later}`).open).toBeUndefined();
    }
  });

  it("parses print widths within the dialog's limits, and a width implies print", () => {
    expect(parsePrintWidth("40mm")).toEqual({ size: 40, unit: "mm" });
    expect(parsePrintWidth("1.5in")).toEqual({ size: 1.5, unit: "in" });
    expect(parsePrintWidth("4mm")).toBeNull();
    expect(parsePrintWidth("2001mm")).toBeNull();
    expect(parsePrintWidth("80in")).toBeNull();
    expect(parsePrintWidth("40")).toBeNull();
    expect(parsePrintWidth("40cm")).toBeNull();
    expect(parseHref("/playground?open=print&print=40mm")).toEqual({
      open: "print",
      print: { size: 40, unit: "mm" },
    });
    expect(parseHref("/playground?print=40mm").open).toBe("print");
    expect(parseHref("/playground?open=code&print=40mm")).toEqual({
      open: "code",
    });
  });

  it("takes the Get code tabs that ship, with the code dialog", () => {
    for (const lang of ["react", "shadcn", "image", "api", "mcp"]) {
      expect(parseHref(`/playground?open=code&lang=${lang}`).lang).toBe(lang);
    }
    // The CLI tab is hidden until a working @qrdx/cli is on npm.
    expect(parseHref("/playground?open=code&lang=cli").lang).toBeUndefined();
    expect(parseHref("/playground?open=code&lang=vue").lang).toBeUndefined();
    expect(parseHref("/playground?lang=react").lang).toBeUndefined();
  });

  it("offers a link for exactly the Get code tabs that ship", () => {
    expect([...CODE_LANGS]).toEqual([...CODE_TABS]);
  });

  it("only takes sections the Design tab can open", () => {
    expect(parseHref("/playground?section=logo").section).toBe("logo");
    expect(parseHref("/playground?section=stickers").section).toBeUndefined();
    // The engine-option sections (customization-sections.tsx) open too
    expect(parseHref("/playground?section=shape").section).toBe("shape");
    // Art isn't a Design section any more: it opens the Art tab.
    expect(parseHref("/playground?section=art").section).toBeUndefined();
  });

  it("checks a style value's shape and size, not its content", () => {
    expect(parseHref("/playground?style=1.eyJiIjoiI2ZmZiJ9").style).toBe(
      "1.eyJiIjoiI2ZmZiJ9",
    );
    expect(parseHref("/playground?style=2.eyJiIjoiI2ZmZiJ9").style).toBe(
      undefined,
    );
    expect(parseHref("/playground?style=1.ab%2Bcd").style).toBeUndefined();
    const long = `1.${"a".repeat(MAX_STYLE_PARAM_LENGTH)}`;
    expect(parseHref(`/playground?style=${long}`).style).toBeUndefined();
  });

  it("never reads private form fields", () => {
    const params = parseHref(
      "/playground?type=wifi&ssid=Home&password=secret&phone=123&email=a@b.co",
    );
    expect(params).toEqual({ type: "wifi" });
    expect(JSON.stringify(params)).not.toMatch(/secret|Home|123|a@b/);
  });
});

describe("playgroundHref", () => {
  it("builds the links the hand-offs use", () => {
    expect(playgroundHref()).toBe("/playground");
    expect(playgroundHref({ type: "wifi" })).toBe("/playground?type=wifi");
    expect(playgroundHref({ preset: "halloweenPumpkin" })).toBe(
      "/playground?preset=halloweenPumpkin",
    );
    expect(playgroundHref({ tab: "design" })).toBe("/playground?tab=design");
    expect(
      playgroundHref({ open: "print", print: { size: 40, unit: "mm" } }),
    ).toBe("/playground?open=print&print=40mm");
    expect(playgroundHref({ themeId: "abc123", tab: "design" })).toBe(
      "/playground/abc123?tab=design",
    );
  });

  it("puts a web address after the # so it never reaches a server", () => {
    const href = playgroundHref({ url: "https://example.com/a?b=c" });
    expect(href).toBe("/playground#url=https%3A%2F%2Fexample.com%2Fa%3Fb%3Dc");
    expect(new URL(href, "https://qrdx.dev").search).toBe("");
  });

  it("drops anything that isn't allowed", () => {
    expect(playgroundHref({ url: "javascript:alert(1)" })).toBe("/playground");
    expect(playgroundHref({ url: "https://u:p@example.com" })).toBe(
      "/playground",
    );
    expect(playgroundHref({ preset: "shuffle-1" })).toBe("/playground");
    expect(playgroundHref({ style: "not-a-style" })).toBe("/playground");
    expect(playgroundHref({ themeId: "t1", preset: "classic" })).toBe(
      "/playground/t1",
    );
    expect(
      playgroundHref({ open: "print", print: { size: 1, unit: "mm" } }),
    ).toBe("/playground?open=print");
  });

  it("round-trips through the reader", () => {
    const options = {
      tab: "design" as const,
      section: "logo" as const,
      type: "url" as const,
      url: "https://example.com/menu",
      preset: "classic",
      style: "1.eyJiIjoiI2ZmZiJ9",
      open: "print" as const,
      print: { size: 1.5, unit: "in" as const },
    };
    expect(parseHref(playgroundHref(options))).toEqual({
      tab: "customisations",
      section: "logo",
      type: "url",
      url: "https://example.com/menu",
      preset: "classic",
      style: "1.eyJiIjoiI2ZmZiJ9",
      open: "print",
      print: { size: 1.5, unit: "in" },
    });
    expect(parseHref(playgroundHref({ open: "code", lang: "react" }))).toEqual({
      open: "code",
      lang: "react",
    });
  });
});

describe("printDistance", () => {
  it("accepts a number and a unit: cm, m, in or ft", () => {
    expect(parsePrintDistance("1m")).toEqual({ value: 1, unit: "m" });
    expect(parsePrintDistance("30cm")).toEqual({ value: 30, unit: "cm" });
    expect(parsePrintDistance("3ft")).toEqual({ value: 3, unit: "ft" });
    expect(parsePrintDistance("36in")).toEqual({ value: 36, unit: "in" });
    expect(parsePrintDistance("2.5M")).toEqual({ value: 2.5, unit: "m" });
  });

  it("stays within what the Print tab can produce", () => {
    // The 0.4 mm minimum module: 100 mm. The largest width over the fewest
    // modules (2000 mm / 21 × 250): about 23.8 m.
    expect(PRINT_DISTANCE_MIN_MM).toBe(100);
    expect(PRINT_DISTANCE_MAX_MM).toBeCloseTo(23_809.52, 1);
    expect(parsePrintDistance("10cm")).toEqual({ value: 10, unit: "cm" });
    expect(parsePrintDistance("0.1m")).toEqual({ value: 0.1, unit: "m" });
    expect(parsePrintDistance("9cm")).toBeNull();
    expect(parsePrintDistance("23.8m")).toEqual({ value: 23.8, unit: "m" });
    expect(parsePrintDistance("23.9m")).toBeNull();
    expect(parsePrintDistance("78ft")).toEqual({ value: 78, unit: "ft" });
    expect(parsePrintDistance("79ft")).toBeNull();
  });

  it("ignores garbage", () => {
    for (const raw of [
      "",
      "1",
      "m",
      "1 m",
      "1meter",
      "-1m",
      "1e3cm",
      "1mm",
      "1.2345m",
      "0x10m",
      "1m;2m",
    ]) {
      expect(parsePrintDistance(raw), raw).toBeNull();
    }
    expect(parsePrintDistance(null)).toBeNull();
  });

  it("only goes with open=print, and wins over a width", () => {
    expect(parseHref("/playground?open=print&printDistance=1m")).toEqual({
      open: "print",
      printDistance: { value: 1, unit: "m" },
    });
    expect(
      parseHref("/playground?open=print&print=40mm&printDistance=3ft"),
    ).toEqual({ open: "print", printDistance: { value: 3, unit: "ft" } });
    // A bad distance leaves the width in charge.
    expect(
      parseHref("/playground?open=print&print=40mm&printDistance=nope"),
    ).toEqual({ open: "print", print: { size: 40, unit: "mm" } });
    expect(parseHref("/playground?printDistance=1m")).toEqual({});
    expect(parseHref("/playground?open=code&printDistance=1m")).toEqual({
      open: "code",
    });
  });

  it("is written by playgroundHref and stripped once applied", () => {
    const href = playgroundHref({
      open: "print",
      printDistance: { value: 1, unit: "m" },
    });
    expect(href).toBe("/playground?open=print&printDistance=1m");
    expect(
      playgroundHref({
        print: { size: 40, unit: "mm" },
        printDistance: { value: 3, unit: "ft" },
      }),
    ).toBe("/playground?open=print&printDistance=3ft");
    expect(
      playgroundHref({ printDistance: { value: 1, unit: "mm" as never } }),
    ).toBe("/playground");
    expect(stripOneShotParams(`https://qrdx.dev${href}`, null)).toBe(
      "/playground",
    );
  });
});

describe("/tools/print-size → Print tab round trip", () => {
  // The calculator links its distance as entered (print-size-calculator.tsx).
  const calculatorLink = (value: number, unit: "m" | "ft") => {
    const distance = parsePrintDistance(formatPrintDistance({ value, unit }));
    if (!distance) throw new Error("not linkable");
    return playgroundHref({ open: "print", printDistance: distance });
  };
  // The editor's default design on a typical link.
  const code = { value: "https://example.org/menu", level: "Q" as const };
  const modules = getQRModuleCount(code);

  it("shows 1 m in the Print tab, with the width for this code", () => {
    const link = calculatorLink(1, "m");
    expect(link).toBe("/playground?open=print&printDistance=1m");
    const { printDistance } = parseHref(link);
    if (!printDistance) throw new Error("no printDistance");
    const tab = printTabForDistance(printDistance, modules);
    expect(tab.unit).toBe("mm");
    expect(tab.fieldDistance).toBe(1);
    expect(modules).toBe(29);
    expect(tab.size).toBe(116);
    expect(scanDistanceForPrintWidth(tab.size, "mm", modules, "m")).toBe(1);
  });

  it("shows 3 ft in the Print tab, in inches", () => {
    const { printDistance } = parseHref(calculatorLink(3, "ft"));
    if (!printDistance) throw new Error("no printDistance");
    const tab = printTabForDistance(printDistance, modules);
    expect(tab.unit).toBe("in");
    expect(tab.fieldDistance).toBe(3);
    expect(tab.size).toBe(printWidthForScanDistance(3, "ft", "in", modules));
    const back = scanDistanceForPrintWidth(tab.size, "in", modules, "ft");
    expect(back).not.toBeNull();
    expect(Math.round((back ?? 0) * 100) / 100).toBe(3);
  });

  it("puts centimetres and inches in the field's own unit", () => {
    expect(
      printTabForDistance({ value: 50, unit: "cm" }, modules),
    ).toMatchObject({ unit: "mm", fieldDistance: 0.5 });
    expect(
      printTabForDistance({ value: 36, unit: "in" }, modules),
    ).toMatchObject({ unit: "in", fieldDistance: 3 });
  });
});

describe("stripOneShotParams", () => {
  it("removes the one-shot parameters and keeps the rest", () => {
    expect(
      stripOneShotParams(
        "https://qrdx.dev/playground?type=wifi&preset=classic&utm_source=x&season=off&tab=design",
        "customisations",
      ),
    ).toBe("/playground?utm_source=x&season=off&tab=customisations");
    expect(
      stripOneShotParams(
        "https://qrdx.dev/playground?open=print&print=40mm&style=1.abc&lang=react&section=logo",
        null,
      ),
    ).toBe("/playground");
  });

  it("clears a parameter fragment but keeps a plain anchor", () => {
    expect(
      stripOneShotParams(
        "https://qrdx.dev/playground#url=https%3A%2F%2Fexample.com",
        null,
      ),
    ).toBe("/playground");
    expect(
      stripOneShotParams("https://qrdx.dev/playground?type=url#top", null),
    ).toBe("/playground#top");
  });

  it("leaves nothing to apply a second time", () => {
    const href =
      "https://qrdx.dev/playground?type=wifi&style=1.abc&open=code#url=https%3A%2F%2Fexample.com";
    const first = parseHref(href);
    expect(hasOneShotParams(first)).toBe(true);
    const second = parseHref(stripOneShotParams(href, null));
    expect(hasOneShotParams(second)).toBe(false);
  });
});

describe("handoffSource", () => {
  const origin = "https://qrdx.dev";
  it("names the source without any value from the address", () => {
    expect(handoffSource("", origin)).toBe("direct");
    expect(handoffSource("https://google.com/search?q=x", origin)).toBe(
      "external",
    );
    expect(
      handoffSource("https://qrdx.dev/qr-code-generator/wifi", origin),
    ).toBe("qr-code-generator");
    expect(handoffSource("https://qrdx.dev/", origin)).toBe("home");
    expect(handoffSource("", origin, "chrome-extension")).toBe(
      "chrome-extension",
    );
    expect(handoffSource("", origin, "https://evil.example")).toBe("direct");
  });
});

// ── The Art tab (hub phase 3) ───────────────────────────────────────────────

describe("the Art tab", () => {
  it("opens with tab=art and picks a mode with art=", () => {
    expect(parseHref("/playground?tab=art")).toEqual({ tab: "art" });
    expect(parseHref("/playground?tab=art&art=logo")).toEqual({
      tab: "art",
      art: "logo",
    });
    expect(parseHref("/playground?tab=art&art=IMAGE").art).toBe("image");
    expect(parseHref("/playground?tab=art&art=photo")).toEqual({ tab: "art" });
  });

  it("brings the Art tab with art=, and drops it beside another tab", () => {
    expect(parseHref("/playground?art=image")).toEqual({
      tab: "art",
      art: "image",
    });
    expect(parseHref("/playground?tab=design&art=logo")).toEqual({
      tab: "customisations",
    });
    expect(parseHref("/playground?tab=content&art=ai").art).toBeUndefined();
  });

  it("takes an AI art style only with art=ai, and never a prompt", () => {
    expect(
      parseHref(
        "/playground?tab=art&art=ai&artStyle=zen-garden&prompt=a%20cat",
      ),
    ).toEqual({ tab: "art", art: "ai", artStyle: "zen-garden" });
    expect(
      parseHref("/playground?tab=art&art=logo&artStyle=zen-garden").artStyle,
    ).toBeUndefined();
    expect(
      parseHref("/playground?tab=art&art=ai&artStyle=Zen%20Garden!").artStyle,
    ).toBeUndefined();
    expect(parseArtStyleId("Neon-City")).toBe("neon-city");
    expect(parseArtStyleId(`a${"b".repeat(60)}`)).toBeNull();
  });

  it("accepts every AI art style preset as a link", () => {
    for (const preset of AI_ART_PRESETS) {
      expect(parseArtStyleId(preset.id)).toBe(preset.id);
    }
  });

  it("opens the Art tab from the old Design section link", () => {
    expect(parseHref("/playground?tab=customisations&section=art")).toEqual({
      tab: "art",
    });
    expect(parseHref("/playground?tab=settings&section=art").tab).toBe("art");
    expect(parseHref("/playground?section=art")).toEqual({ tab: "art" });
    // A link naming another tab keeps it.
    expect(parseHref("/playground?tab=content&section=art")).toEqual({
      tab: "content",
    });
  });

  it("opens every Design section by its id", () => {
    for (const section of DESIGN_SECTIONS) {
      expect(parseHref(`/playground?section=${section}`).section).toBe(section);
    }
  });

  it("writes Art links that read back the same", () => {
    const ai = playgroundHref({
      tab: "art",
      art: "ai",
      artStyle: "zen-garden",
    });
    expect(ai).toBe("/playground?tab=art&art=ai&artStyle=zen-garden");
    expect(parseHref(ai)).toEqual({
      tab: "art",
      art: "ai",
      artStyle: "zen-garden",
    });
    expect(playgroundHref({ art: "logo" })).toBe(
      "/playground?tab=art&art=logo",
    );
    expect(playgroundHref({ tab: "art" })).toBe("/playground?tab=art");
    // A style only with AI art, no art beside another tab.
    expect(playgroundHref({ art: "image", artStyle: "zen-garden" })).toBe(
      "/playground?tab=art&art=image",
    );
    expect(playgroundHref({ tab: "content", art: "logo" })).toBe(
      "/playground?tab=content",
    );
    expect(playgroundHref({ art: "ai", artStyle: "<script>" as string })).toBe(
      "/playground?tab=art&art=ai",
    );
  });

  it("applies art= and artStyle= once, and keeps the tab", () => {
    const href = "https://qrdx.dev/playground?tab=art&art=ai&artStyle=sushi";
    expect(hasOneShotParams(parseHref(href))).toBe(true);
    const stripped = stripOneShotParams(href, "art");
    expect(stripped).toBe("/playground?tab=art");
    expect(hasOneShotParams(parseHref(stripped))).toBe(false);
    expect(
      stripOneShotParams(
        "https://qrdx.dev/playground?tab=customisations&section=art",
        "art",
      ),
    ).toBe("/playground?tab=art");
  });
});

// ─── open=dynamic (hub phase 4) ─────────────────────────────────────────────
describe("open=dynamic", () => {
  it("is read on its own and with the link's address", () => {
    expect(parseHref("/playground?open=dynamic")).toEqual({ open: "dynamic" });
    expect(
      parseHref(
        "/playground?open=dynamic#url=https%3A%2F%2Fexample.com%2Fmenu",
      ),
    ).toEqual({
      open: "dynamic",
      type: "url",
      url: "https://example.com/menu",
    });
    expect(parseHref("/playground?open=DYNAMIC")).toEqual({ open: "dynamic" });
  });

  it("doesn't take a print width or a Get code tab", () => {
    expect(parseHref("/playground?open=dynamic&print=40mm")).toEqual({
      open: "dynamic",
    });
    expect(parseHref("/playground?open=dynamic&lang=react")).toEqual({
      open: "dynamic",
    });
  });

  it("is written with the address after the #", () => {
    const href = playgroundHref({
      open: "dynamic",
      url: "https://example.com/menu",
    });
    expect(href).toBe(
      "/playground?open=dynamic#url=https%3A%2F%2Fexample.com%2Fmenu",
    );
    expect(parseHref(href)).toEqual({
      open: "dynamic",
      type: "url",
      url: "https://example.com/menu",
    });
  });

  it("applies once and is removed from the address", () => {
    const href = "https://qrdx.dev/playground?open=dynamic&utm_source=x";
    expect(hasOneShotParams(parseHref(href))).toBe(true);
    const left = stripOneShotParams(href, null);
    expect(left).toBe("/playground?utm_source=x");
    expect(hasOneShotParams(parseHref(left))).toBe(false);
  });
});
// ─── end open=dynamic ───────────────────────────────────────────────────────
