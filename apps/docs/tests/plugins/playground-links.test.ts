// The plugins can't import the app, so each builds its playground link with a
// local copy of the rules (plugins/*/src/playground-link.ts). These tests hold
// every copy to the site's reader, lib/playground-links.ts.

import { describe, expect, it, test } from "vitest";
import {
  handoffSource,
  parseLinkUrl,
  parsePlaygroundParams,
} from "@/lib/playground-links";
import { defaultPresets } from "@/utils/qr-presets";
import * as canva from "../../../../plugins/canva/src/playground-link";
import * as figma from "../../../../plugins/figma/src/playground-link";
import { PRESETS as FIGMA_PRESETS } from "../../../../plugins/figma/src/presets";
import * as raycast from "../../../../plugins/raycast/src/playground-link";

const ORIGIN = "https://qrdx.dev";

/** What the playground makes of a link, plus its `ref` tag. */
function read(link: string) {
  const url = new URL(link);
  return {
    origin: url.origin,
    path: url.pathname,
    params: parsePlaygroundParams(url.search, url.hash),
    ref: url.searchParams.get("ref"),
    // Every name in the query, so nothing is sent that the reader drops.
    queryNames: [...url.searchParams.keys()],
    hashNames: [...new URLSearchParams(url.hash.replace(/^#/, "")).keys()],
  };
}

const PLUGINS = [
  {
    name: "Figma",
    ref: "figma-plugin",
    link: (value: string) => figma.playgroundLink({ value }),
    webAddress: figma.webAddress,
  },
  {
    name: "Canva",
    ref: "canva-app",
    link: canva.playgroundLink,
    webAddress: canva.webAddress,
  },
  {
    name: "Raycast",
    ref: "raycast-extension",
    link: raycast.playgroundLink,
    webAddress: raycast.webAddress,
  },
] as const;

// Addresses each copy must judge exactly as parseLinkUrl does.
const ADDRESSES = [
  "https://example.com",
  "  https://example.com/menu?table=4#top  ",
  "http://example.com/a b",
  "HTTPS://Example.COM/Path",
  `https://example.com/${"a".repeat(2100)}`,
  "https://user:secret@example.com",
  "https://user@example.com",
  "javascript:alert(1)",
  "data:text/html,hi",
  "mailto:hi@example.com",
  "ftp://example.com/file",
  "WIFI:T:WPA;S:Home;P:hunter2;;",
  "Meet at 6pm",
  "example.com",
  "",
];

describe.each(PLUGINS)("$name plugin link", (plugin) => {
  test("opens the playground on qrdx.dev, tagged with the plugin as its source", () => {
    const link = read(plugin.link("https://example.com"));
    expect(link.origin).toBe(ORIGIN);
    expect(link.path).toBe("/playground");
    expect(link.ref).toBe(plugin.ref);
    // handoffSource takes the tag as the source, so the event names the plugin.
    expect(handoffSource("", ORIGIN, link.ref)).toBe(plugin.ref);
  });

  test("carries a web address after the #, as the URL type", () => {
    const raw = plugin.link("https://example.com/menu?table=4");
    expect(raw.split("#")[0]).not.toContain("example.com");
    const link = read(raw);
    expect(link.params).toEqual({
      type: "url",
      url: "https://example.com/menu?table=4",
    });
    expect(link.hashNames).toEqual(["url"]);
  });

  test("judges every address the way the playground does", () => {
    for (const address of ADDRESSES) {
      expect(plugin.webAddress(address), address).toBe(parseLinkUrl(address));
      const params = read(plugin.link(address)).params;
      expect(params.url ?? null, address).toBe(parseLinkUrl(address));
    }
  });

  test("never passes text, Wi-Fi details or other content", () => {
    for (const value of ["Meet at 6pm", "WIFI:T:WPA;S:Home;P:hunter2;;"]) {
      const raw = plugin.link(value);
      expect(raw).not.toContain("#");
      expect(raw).not.toContain("hunter2");
      expect(read(raw).params).toEqual({});
    }
  });

  test("sends nothing the playground would drop", () => {
    const link = read(plugin.link("https://example.com"));
    expect(link.queryNames.filter((name) => name !== "ref")).toEqual([]);
  });
});

describe("Figma presets in the link", () => {
  it("names only presets that look the same in the playground", () => {
    for (const id of figma.PLAYGROUND_PRESETS) {
      const mine = FIGMA_PRESETS.find((preset) => preset.id === id);
      const theirs = defaultPresets[id];
      expect(mine, id).toBeDefined();
      expect(theirs, id).toBeDefined();
      if (!(mine && theirs)) continue;
      const { id: _id, label: _label, ...look } = mine;
      const picked = Object.fromEntries(
        Object.keys(look).map((key) => [
          key,
          (theirs.styles as Record<string, unknown>)[key],
        ]),
      );
      // Same colors (any case) and patterns. If this fails, the playground's
      // preset changed: take it out of PLAYGROUND_PRESETS or resync both.
      expect(JSON.stringify(picked).toLowerCase(), id).toBe(
        JSON.stringify(look).toLowerCase(),
      );
    }
  });

  it("sends a matching preset, and leaves the drifted ones and custom colors out", () => {
    const value = "https://example.com";
    expect(
      read(figma.playgroundLink({ value, presetId: "classic" })).params,
    ).toEqual({ type: "url", url: "https://example.com/", preset: "classic" });
    // "nature" exists in both, but looks different in the playground now.
    expect(
      read(figma.playgroundLink({ value, presetId: "nature" })).params.preset,
    ).toBeUndefined();
    expect(
      read(
        figma.playgroundLink({
          value,
          presetId: "classic",
          customColors: true,
        }),
      ).params.preset,
    ).toBeUndefined();
    // Without a web address, the preset still opens.
    expect(
      read(figma.playgroundLink({ value: "hello", presetId: "minimal" }))
        .params,
    ).toEqual({ preset: "minimal" });
  });

  it("lets the main thread open only links the plugin built", () => {
    expect(
      figma.isPlaygroundLink(
        figma.playgroundLink({ value: "https://example.com" }),
      ),
    ).toBe(true);
    expect(figma.isPlaygroundLink("https://evil.example/playground")).toBe(
      false,
    );
    expect(
      figma.isPlaygroundLink("https://qrdx.dev.evil.example/playground"),
    ).toBe(false);
    expect(figma.isPlaygroundLink("https://qrdx.dev/dashboard")).toBe(false);
    expect(figma.isPlaygroundLink(42)).toBe(false);
  });
});
