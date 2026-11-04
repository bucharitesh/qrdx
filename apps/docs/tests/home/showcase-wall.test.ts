// The "Made with QRdx" walls (lib/landing/showcase-gallery.ts and
// showcase-wall.ts): what each wall shows, how its rows sit, where its tiles
// go and what their codes hold. That every tile scans is
// gallery-scan-*.test.ts; that the images are self-contained is
// gallery-route.test.ts.
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  BODY_PATTERN,
  CORNER_EYE_DOT_PATTERNS,
  CORNER_EYE_PATTERNS,
  FRAME_STYLES,
  getTemplateIds,
  isFrameActive,
  OFFICIAL_FRAMES,
  QR_ART_VARIANTS,
} from "qrdx";
import type { ColorConfig } from "qrdx/types";
import { describe, expect, it } from "vitest";
import {
  SAMPLE_HOSTS,
  TILE_ASPECT,
  tileBackdrop,
  tileLogo,
  tileStyles,
  WALL_TILES,
  type WallTile,
} from "@/lib/landing/showcase-gallery";
import {
  COMMUNITY_WALL,
  HOME_WALL,
  type WallPlacement,
  type WallRow,
  wallPlacements,
} from "@/lib/landing/showcase-wall";
import { getTemplate, listTemplates } from "@/lib/landing/templates";
import { parsePlaygroundParams } from "@/lib/playground-links";
import { QR_TYPE_SLUGS } from "@/lib/qr-types-content";
import type { ThemeCategory } from "@/types/theme";
import { defaultPresets } from "@/utils/qr-presets";

const APP = join(import.meta.dirname, "../..");

const colorKind = (color: ColorConfig | undefined) =>
  !color || typeof color === "string" ? "solid" : color.type;

const rowSum = (placements: WallPlacement[]) =>
  placements.reduce((sum, p) => sum + TILE_ASPECT[p.shape], 0);

const rowTiles = (row: WallRow) => row.halves.flat();

/** How a tile is drawn, beyond its colors. */
function treatment(tile: WallTile): string {
  const styles = tileStyles(tile);
  if (tile.art) return "art";
  if (styles.templateId) return "border";
  if (styles.frame && isFrameActive(styles.frame)) return "frame";
  return "plain";
}

const rgb = (hex: string) =>
  [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));

function colorDistance(a: string, b: string): number {
  const [x, y] = [rgb(a), rgb(b)];
  return Math.hypot(...x.map((value, i) => value - (y[i] ?? 0)));
}

/** Why two neighbouring tiles look alike, or null. */
function alike(a: WallTile, b: WallTile): string | null {
  if (a.preset === b.preset && !a.style && !b.style) return "same theme";
  const [sa, sb] = [tileStyles(a), tileStyles(b)];
  if (
    sa.bodyPattern === sb.bodyPattern &&
    treatment(a) === treatment(b) &&
    treatment(a) !== "frame"
  ) {
    return `both ${sa.bodyPattern} modules`;
  }
  const [ga, gb] = [tileBackdrop(a), tileBackdrop(b)];
  if (
    ga &&
    gb &&
    treatment(a) === treatment(b) &&
    colorDistance(ga, gb) < 12 &&
    colorKind(sa.fgColor) === colorKind(sb.fgColor) &&
    JSON.stringify(sa.fgColor) === JSON.stringify(sb.fgColor)
  ) {
    return "same colors";
  }
  return null;
}

describe("wall tiles", () => {
  it("have unique, URL-safe ids", () => {
    const ids = WALL_TILES.map((tile) => tile.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it("show every built-in theme once, opening it in the playground", () => {
    const themes = WALL_TILES.filter((tile) => tile.band === "themes");
    expect(themes.map((tile) => tile.preset).sort()).toEqual(
      Object.keys(defaultPresets).sort(),
    );
    for (const tile of themes) {
      expect(tile.appliesPreset, tile.id).toBe(true);
      expect(
        parsePlaygroundParams(new URL(tile.href, APP_ORIGIN).search),
      ).toEqual({ preset: tile.preset });
    }
  });

  it("use built-in themes and say what they show", () => {
    for (const tile of WALL_TILES) {
      expect(defaultPresets, tile.id).toHaveProperty(tile.preset);
      expect(tile.label, tile.id).toBeTruthy();
      expect(tile.detail, tile.id).toBeTruthy();
      expect(tile.alt.length, tile.id).toBeGreaterThan(12);
    }
  });

  it("link to pages that exist", () => {
    const frames = new Set(OFFICIAL_FRAMES.map((frame) => frame.id));
    for (const tile of WALL_TILES) {
      const url = new URL(tile.href, APP_ORIGIN);
      const path = url.pathname;
      const generator = /^\/qr-code-generator\/([\w-]+)$/.exec(path);
      const demo = /^\/templates\/([\w-]+)\/([\w-]+)$/.exec(path);
      const frame = /^\/community\/frames\/([\w-]+)$/.exec(path);
      if (generator) {
        expect(QR_TYPE_SLUGS, tile.id).toContain(generator[1]);
      } else if (demo) {
        const variants = getTemplate(demo[1] as string)?.variants ?? [];
        expect(
          variants.map((variant) => variant.id),
          tile.id,
        ).toContain(demo[2]);
      } else if (frame) {
        expect(frames.has(frame[1] as string), tile.id).toBe(true);
      } else if (path === "/playground") {
        const params = parsePlaygroundParams(url.search);
        expect(Object.keys(params).length, tile.id).toBeGreaterThan(0);
        if (params.preset) expect(defaultPresets).toHaveProperty(params.preset);
        // Logo QR and Image QR open the Art tab in their own mode.
        if (tile.art) {
          expect(params, tile.id).toEqual({
            tab: "art",
            art: tile.art.mode === "logo" ? "logo" : "image",
          });
        }
      } else {
        expect(path, tile.id).toMatch(/^\/docs\//);
        expect(
          existsSync(join(APP, "content", `${path}.mdx`)),
          `${tile.id}: ${path}`,
        ).toBe(true);
      }
    }
  });

  it("hold obvious samples, not real people's details", () => {
    for (const { id, value } of WALL_TILES) {
      for (const [url] of value.matchAll(/https?:\/\/[^\s;]+/g)) {
        const { host, pathname } = new URL(url);
        expect(SAMPLE_HOSTS, `${id}: ${host}`).toContain(host);
        const handle = SAMPLE_PATHS[host];
        if (handle) expect(pathname, id).toMatch(handle);
      }
      for (const [address] of value.matchAll(/[\w.+-]+@[\w.-]+/g)) {
        expect(address, id).toMatch(/@example(\.com)?$/);
      }
      for (const [digits] of value.matchAll(/\+?1?415555\d{4}/g)) {
        expect(digits, id).toMatch(/55501\d\d$/);
      }
    }
  });
});

const APP_ORIGIN = "https://qrdx.dev";

/**
 * Accounts a platform link may open: the platform's own, or a placeholder
 * nobody would take for a real person (production's generator examples).
 */
const SAMPLE_PATHS: Record<string, RegExp> = {
  "www.facebook.com": /^\/facebook$/,
  "www.instagram.com": /^\/instagram$/,
  "www.reddit.com": /^\/r\/reddit$/,
  "www.tiktok.com": /^\/@tiktok$/,
  "twitter.com": /^\/X$/,
  "www.linkedin.com": /^\/company\/linkedin$/,
  "www.youtube.com": /^\/@YouTube$/,
  "www.pinterest.com": /^\/pinterest$/,
  "www.snapchat.com": /^\/add\/teamsnapchat$/,
  "www.threads.net": /^\/@threads$/,
  // Spotify's own Today's Top Hits.
  "open.spotify.com": /^\/playlist\/37i9dQZF1DXcBWIGoYBM5M$/,
  "paypal.me": /^\/yourname$/,
  "venmo.com": /^\/your-name$/,
  "www.etsy.com": /^\/shop\/YourShopName$/,
  "cal.com": /^\/yourname\//,
  "drive.google.com": /sample-file-id/,
};

describe("the home wall", () => {
  const placements = wallPlacements(HOME_WALL);
  const tiles = placements.map((p) => p.tile);

  it("is four or five rows of about eight, 30 to 40 tiles", () => {
    expect(HOME_WALL.length).toBeGreaterThanOrEqual(4);
    expect(HOME_WALL.length).toBeLessThanOrEqual(5);
    expect(tiles.length).toBeGreaterThanOrEqual(30);
    expect(tiles.length).toBeLessThanOrEqual(40);
    expect(new Set(tiles.map((t) => t.id)).size).toBe(tiles.length);
    for (const row of HOME_WALL) {
      expect(rowTiles(row).length).toBeGreaterThanOrEqual(6);
      expect(rowTiles(row).length).toBeLessThanOrEqual(8);
    }
  });

  it("gives its desktop rows about one height", () => {
    const sums = HOME_WALL.map((row) => rowSum(rowTiles(row)));
    const mean = sums.reduce((a, b) => a + b, 0) / sums.length;
    for (const sum of sums) {
      expect(Math.abs(sum - mean) / mean, `${sums}`).toBeLessThanOrEqual(0.04);
    }
  });

  it("shows tablets and phones two rows' halves of three, one height", () => {
    const compact = HOME_WALL.filter((row) => row.compact);
    expect(compact).toEqual(HOME_WALL.slice(0, 2));
    const halves = HOME_WALL.flatMap((row) => row.halves);
    const sums = halves.map((half) => rowSum(half.filter((p) => p.compact)));
    for (const [index, half] of halves.entries()) {
      expect(half.filter((p) => p.compact).length).toBe(3);
      expect(
        Math.abs((sums[index] ?? 0) - 3.05),
        `${sums}`,
      ).toBeLessThanOrEqual(0.1);
    }
  });

  it("shows every content type", () => {
    const types = new Set(tiles.map((t) => t.contentType).filter(Boolean));
    for (const type of QR_TYPE_SLUGS) expect(types, type).toContain(type);
  });

  it("shows every family somewhere", () => {
    const categories = new Set(
      tiles.map((t) => defaultPresets[t.preset]?.category),
    );
    const families: ThemeCategory[] = [
      "essentials",
      "brand",
      "pastel",
      "bold",
      "gradient",
      "elegant",
      "playful",
      "industry",
    ];
    for (const family of families) expect(categories, family).toContain(family);
    const styles = tiles.map(tileStyles);
    const kinds = new Set(styles.map((s) => colorKind(s.fgColor)));
    expect(kinds).toContain("linear");
    expect(kinds).toContain("radial");
    expect(tiles.some((t) => t.art?.mode === "logo")).toBe(true);
    expect(tiles.some((t) => t.art?.mode === "halftone")).toBe(true);
    expect(tiles.some((t) => tileLogo(t) === "qrdx")).toBe(true);
    expect(tiles.some((t) => t.officialFrame)).toBe(true);
    expect(styles.some((s) => s.templateId)).toBe(true);
    expect(tiles.some((t) => t.pageType)).toBe(true);
    // Neon: dark modules on a neon ground.
    expect(
      tiles.some((t) => defaultPresets[t.preset]?.tags?.includes("neon")),
    ).toBe(true);
  });

  it("never puts two tiles that look alike side by side", () => {
    for (const row of HOME_WALL) {
      const line = rowTiles(row).map((p) => p.tile);
      for (let i = 1; i < line.length; i++) {
        const [a, b] = [line[i - 1] as WallTile, line[i] as WallTile];
        expect(alike(a, b), `${a.id} next to ${b.id}`).toBeNull();
      }
    }
  });
});

describe("the community wall", () => {
  const placements = COMMUNITY_WALL.flatMap((section) =>
    wallPlacements(section.rows),
  );
  const tiles = placements.map((p) => p.tile);
  const styles = tiles.map(tileStyles);
  const used = <T>(pick: (s: (typeof styles)[number]) => T) =>
    new Set(styles.map(pick));

  it("shows every tile once, 120 or more, in four titled bands", () => {
    expect(tiles.map((t) => t.id).sort()).toEqual(
      WALL_TILES.map((t) => t.id).sort(),
    );
    expect(tiles.length).toBeGreaterThanOrEqual(120);
    expect(COMMUNITY_WALL.map((s) => s.band)).toEqual([
      "themes",
      "frames",
      "art",
      "content",
    ]);
    for (const section of COMMUNITY_WALL) {
      expect(section.title).toBeTruthy();
      expect(section.id).toMatch(/^made-with-qrdx-[a-z]+$/);
      expect(section.count).toBe(wallPlacements(section.rows).length);
    }
  });

  it("keeps a band's rows and half-rows close to one height", () => {
    for (const section of COMMUNITY_WALL) {
      const sums = section.rows.map((row) => rowSum(rowTiles(row)));
      const mean = sums.reduce((a, b) => a + b, 0) / sums.length;
      for (const sum of sums) {
        expect(
          Math.abs(sum - mean) / mean,
          `${section.band} ${sums}`,
        ).toBeLessThanOrEqual(0.12);
      }
      const halves = section.rows.flatMap((row) => row.halves).map(rowSum);
      const half = halves.reduce((a, b) => a + b, 0) / halves.length;
      for (const sum of halves) {
        expect(
          Math.abs(sum - half) / half,
          `${section.band} ${halves}`,
        ).toBeLessThanOrEqual(0.25);
      }
    }
  });

  it("never repeats a theme side by side", () => {
    for (const section of COMMUNITY_WALL) {
      for (const row of section.rows) {
        const line = rowTiles(row).map((p) => p.tile);
        for (let i = 1; i < line.length; i++) {
          const [a, b] = [line[i - 1] as WallTile, line[i] as WallTile];
          if (a.band === "themes") {
            expect(a.preset, `${a.id} next to ${b.id}`).not.toBe(b.preset);
          }
        }
      }
    }
  });

  // Coverage: every option the editor offers is on at least one tile, so
  // the wall can't silently drop one.
  it("uses every body pattern, eye and eye centre", () => {
    const bodies = used((s) => s.bodyPattern);
    for (const pattern of BODY_PATTERN)
      expect(bodies, pattern).toContain(pattern);
    const eyes = used((s) => s.cornerEyePattern);
    for (const pattern of CORNER_EYE_PATTERNS)
      expect(eyes, pattern).toContain(pattern);
    const dots = used((s) => s.cornerEyeDotPattern);
    for (const pattern of CORNER_EYE_DOT_PATTERNS) {
      expect(dots, pattern).toContain(pattern);
    }
  });

  it("uses every frame style, official frame and border template", () => {
    const frames = used((s) => s.frame?.style);
    for (const style of FRAME_STYLES) {
      if (style !== "none") expect(frames, style).toContain(style);
    }
    const official = new Set(tiles.map((t) => t.officialFrame));
    for (const frame of OFFICIAL_FRAMES)
      expect(official, frame.id).toContain(frame.id);
    const templates = used((s) => s.templateId);
    for (const id of getTemplateIds()) {
      if (id !== "default") expect(templates, id).toContain(id);
    }
  });

  it("uses solid, linear and radial color, accent eyes and the QRdx logo", () => {
    const kinds = used((s) => colorKind(s.fgColor));
    for (const kind of ["solid", "linear", "radial"])
      expect(kinds).toContain(kind);
    const accented = styles.filter(
      (s) =>
        JSON.stringify(s.eyeColor ?? s.fgColor) !== JSON.stringify(s.fgColor) ||
        JSON.stringify(s.dotColor ?? s.fgColor) !== JSON.stringify(s.fgColor),
    );
    expect(accented.length).toBeGreaterThanOrEqual(20);
    expect(tiles.some((t) => tileLogo(t) === "qrdx")).toBe(true);
  });

  it("shows Logo QR and Image QR in every variant, transparent and print", () => {
    for (const [mode, variants] of Object.entries(QR_ART_VARIANTS)) {
      for (const variant of variants) {
        expect(
          tiles.some((t) => t.art?.mode === mode && t.art.variant === variant),
          `${mode} ${variant}`,
        ).toBe(true);
      }
    }
    expect(tiles.some((t) => t.transparent)).toBe(true);
    expect(tiles.some((t) => t.print)).toBe(true);
  });

  it("shows every content type and hosted page", () => {
    const types = new Set(tiles.map((t) => t.contentType));
    for (const type of QR_TYPE_SLUGS) expect(types, type).toContain(type);
    const pages = new Set(tiles.map((t) => t.pageType));
    for (const template of listTemplates()) {
      if (template.variants.length > 0) {
        expect(pages, template.type).toContain(template.type);
      }
    }
  });

  it("flags only the options the score marks down", () => {
    const cautions = tiles.filter((t) => t.caution).map((t) => t.id);
    expect(cautions.sort()).toEqual([
      "border-arrow",
      "border-halloween",
      "border-standard-box",
      "eyes-circle",
      "theme-halloween-pumpkin",
    ]);
  });
});
