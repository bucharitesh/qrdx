// Playground links: the one writer (playgroundHref) and reader
// (parsePlaygroundParams). Only harmless state may travel; private content
// never does, and invalid values are dropped on both sides.
import { describe, expect, it } from "vitest";
import {
  handoffSource,
  hasOneShotParams,
  MAX_LINK_URL_LENGTH,
  MAX_STYLE_PARAM_LENGTH,
  parseLinkUrl,
  parsePlaygroundParams,
  parsePrintWidth,
  playgroundHref,
  resolveControlTab,
  stripOneShotParams,
} from "@/lib/playground-links";

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
    expect(resolveControlTab("art")).toBeNull();
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
    expect(parseHref("/playground?open=download").open).toBe("download");
    expect(parseHref("/playground?open=print").open).toBe("print");
    expect(parseHref("/playground?open=code").open).toBe("code");
    for (const later of ["community", "photo-check", "dynamic", "art"]) {
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

  it("only takes the React code language, with the code dialog", () => {
    expect(parseHref("/playground?open=code&lang=react").lang).toBe("react");
    expect(parseHref("/playground?open=code&lang=mcp").lang).toBeUndefined();
    expect(parseHref("/playground?lang=react").lang).toBeUndefined();
  });

  it("only takes sections the Design tab can open today", () => {
    expect(parseHref("/playground?section=logo").section).toBe("logo");
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

  it("ignores art links and art modes from later phases", () => {
    expect(parseHref("/playground?tab=art&art=ai&artStyle=neon")).toEqual({});
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
