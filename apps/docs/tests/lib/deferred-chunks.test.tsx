// Content that loads as it nears the screen (components/infinite/deferred):
// one request for every chunk asked for at once, results kept for the
// session, and every chunk of the /templates gallery and the /community
// wall loaded exactly once.
import { describe, expect, it, vi } from "vitest";

vi.mock(
  "next-intl/server",
  async () => (await import("../support/intl")).intlServer,
);
// next/font only works inside Next's compiler.
vi.mock("next/font/google", () => {
  const font = (options: { variable: string }) => ({
    className: "",
    variable: `font-var${options.variable}`,
    style: { fontFamily: "" },
  });
  return {
    Bricolage_Grotesque: font,
    Cormorant_Garamond: font,
    DM_Sans: font,
    Fraunces: font,
    Instrument_Serif: font,
    Space_Grotesk: font,
  };
});

import {
  EAGER_CARDS,
  parseChunkKey,
} from "@/app/[lang]/(home)/templates/_lib/gallery";
import { loadTemplateCards } from "@/app/[lang]/(home)/templates/actions";
import { createChunkLoader } from "@/components/infinite/deferred";
import { listTemplateDemos } from "@/lib/landing/demo";
import {
  COMMUNITY_WALL,
  chunkRows,
  findWallChunk,
  WALL_ROWS_PER_CHUNK,
  wallChunkKey,
  wallPlacements,
  wallShape,
} from "@/lib/landing/showcase-wall";

describe("createChunkLoader", () => {
  it("asks for every chunk wanted at once in one request", async () => {
    const loadMany = vi.fn(async (keys: string[]) =>
      Object.fromEntries(keys.map((key) => [key, `node ${key}`])),
    );
    const loader = createChunkLoader(loadMany);
    const results = await Promise.all([
      loader.load("a"),
      loader.load("b"),
      loader.load("a"),
    ]);
    expect(results).toEqual(["node a", "node b", "node a"]);
    expect(loadMany).toHaveBeenCalledTimes(1);
    expect(loadMany).toHaveBeenCalledWith(["a", "b"]);
    // Kept for the session: Back shows it without a request.
    expect(loader.cached("a")).toBe("node a");
    expect(loader.cached("c")).toBeUndefined();
  });

  it("fails the chunks that didn't come back, and all of them on an error", async () => {
    const loader = createChunkLoader(async () => ({ a: "node a" }));
    const [a, b] = await Promise.allSettled([
      loader.load("a"),
      loader.load("b"),
    ]);
    expect(a.status).toBe("fulfilled");
    expect(b.status).toBe("rejected");

    const broken = createChunkLoader(async () => {
      throw new Error("offline");
    });
    await expect(broken.load("a")).rejects.toThrow("offline");
    expect(broken.cached("a")).toBeUndefined();
  });
});

describe("/templates cards", () => {
  const demos = listTemplateDemos();
  const types = [...new Set(demos.map((demo) => demo.template.type))];

  it("load every template once: the first screen's on the server, the rest by chunk", async () => {
    // The page's chunks: the first section from EAGER_CARDS on, the others
    // from their first card.
    let left = EAGER_CARDS;
    const keys = types.flatMap((type) => {
      const count = demos.filter((demo) => demo.template.type === type).length;
      const drawn = Math.min(left, count);
      left -= drawn;
      return drawn < count ? [`${type}:${drawn}`] : [];
    });
    const chunks = await loadTemplateCards("en", keys);
    expect(Object.keys(chunks).sort()).toEqual([...keys].sort());
    const loaded = keys.reduce((sum, key) => {
      const chunk = parseChunkKey(key);
      if (!chunk) throw new Error(key);
      return (
        sum +
        demos.filter((demo) => demo.template.type === chunk.type).length -
        chunk.offset
      );
    }, 0);
    expect(loaded + EAGER_CARDS).toBe(demos.length);
  });

  it("leave out keys and languages that name nothing", async () => {
    expect(
      await loadTemplateCards("en", ["nope:0", "links:99", "LINKS:0", "x"]),
    ).toEqual({});
    expect(await loadTemplateCards("xx", [`${types[0]}:0`])).toEqual({});
    expect(parseChunkKey("menu:3")).toEqual({ type: "menu", offset: 3 });
    expect(parseChunkKey("menu:-1")).toBeNull();
  });
});

describe("/community wall chunks", () => {
  it("cover every row once, in order", () => {
    for (const section of COMMUNITY_WALL) {
      const chunks = chunkRows(section.rows);
      expect(chunks.flat()).toEqual(section.rows);
      expect(chunks.every((rows) => rows.length <= WALL_ROWS_PER_CHUNK)).toBe(
        true,
      );
      chunks.forEach((rows, index) => {
        expect(findWallChunk(wallChunkKey(section.band, index))).toEqual(rows);
      });
      expect(
        findWallChunk(wallChunkKey(section.band, chunks.length)),
      ).toBeUndefined();
    }
    expect(findWallChunk("nope:0")).toBeUndefined();
  });

  it("give placeholders each tile's shape", () => {
    const rows = COMMUNITY_WALL[0]?.rows ?? [];
    const shape = wallShape(rows);
    expect(shape.flatMap((row) => row.halves.flat()).length).toBe(
      wallPlacements(rows).length,
    );
    expect(
      shape.every((row, index) => row.compact === rows[index]?.compact),
    ).toBe(true);
  });
});
