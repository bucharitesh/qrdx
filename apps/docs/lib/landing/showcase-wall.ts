import {
  getWallTile,
  TILE_ASPECT,
  type TileShape,
  tileStyles,
  WALL_TILES,
  type WallBand,
  type WallTile,
} from "./showcase-gallery";

/**
 * How the "Made with QRdx" walls lay their tiles out
 * (components/showcase/showcase-wall.tsx). A wall is a stack of justified
 * rows: each tile grows in proportion to its aspect ratio, so every tile in
 * a row has the same height with no measuring.
 *
 * Each desktop row is two halves. From `lg` up the halves sit side by side
 * as one row; below it each half is a row of its own, without the tiles
 * marked not `compact`. The home wall's halves show three tiles there,
 * three squares or a wide one and two tall ones, so those rows match too.
 */

export interface WallPlacement {
  tile: WallTile;
  shape: TileShape;
  /** Shown below `lg` (a home half's fourth tile isn't). */
  compact: boolean;
}

export interface WallRow {
  halves: WallPlacement[][];
  /** Shown below `lg` (the home wall keeps only its first rows there). */
  compact: boolean;
}

/** "type-wifi", or "type-wifi:wide" to give the tile another shape. */
type Slot = `${string}` | `${string}:${TileShape}`;

function place(slot: Slot, index: number): WallPlacement {
  const [id = "", shape] = slot.split(":") as [string, TileShape | undefined];
  const tile = getWallTile(id);
  if (!tile) throw new Error(`Unknown wall tile "${id}"`);
  return { tile, shape: shape ?? tile.shape, compact: index < 3 };
}

/** Rows shown below `lg` on the home page (two halves each). */
const HOME_COMPACT_ROWS = 2;

/**
 * The home wall: every content type, each drawn in a look from a different
 * family (gradient, neon, pastel, earthy, luxury, brand, mono, print-safe,
 * playful, framed, bordered, logo), plus Logo QR, Image QR, the QRdx logo,
 * hosted pages and a print-ready code. Neighbours differ in theme, shape
 * language and color (tests/home/showcase-wall.test.ts).
 */
const HOME_SLOTS: [Slot[], Slot[]][] = [
  [
    ["type-maps", "type-email", "type-tiktok", "art-halftone-color-dog"],
    ["type-url", "type-bitcoin", "type-instagram", "type-vcard"],
  ],
  [
    ["type-whatsapp", "type-twitter", "type-sms", "page-menu"],
    ["type-phone", "type-spotify", "type-text", "art-logo-blend-bloom"],
  ],
  [
    ["type-reddit", "type-linkedin", "type-wifi:tall", "type-youtube"],
    ["type-ethereum", "type-facebook", "type-venmo", "type-upi"],
  ],
  [
    ["type-snapchat", "type-threads", "logo-qrdx", "type-attendance"],
    ["type-etsy", "type-google-drive", "page-apps", "type-dubsh"],
  ],
  [
    ["type-calcom:tall", "type-amazon:wide", "page-event", "print"],
    [
      "type-paypal",
      "type-google-review",
      "type-flipkart",
      "type-pinterest:tall",
    ],
  ],
];

export const HOME_WALL: WallRow[] = HOME_SLOTS.map((halves, row) => ({
  halves: halves.map((half) => half.map(place)),
  compact: row < HOME_COMPACT_ROWS,
}));

// ── The community wall: every tile, in titled bands ──────────────────────

/** Sum of aspect ratios a community row aims for (about six tiles). */
const ROW_TARGET = 6.4;

const aspect = (p: WallPlacement) => TILE_ASPECT[p.shape];

/**
 * Orders tiles so neighbours differ: each next tile is the first left
 * whose theme shelf and body pattern differ from the last one's.
 */
function interleave(tiles: WallTile[]): WallTile[] {
  const left = [...tiles];
  const ordered: WallTile[] = [];
  while (left.length > 0) {
    const last = ordered.at(-1);
    const lastStyles = last && tileStyles(last);
    const index = last
      ? left.findIndex((tile) => {
          const styles = tileStyles(tile);
          return (
            styles.bodyPattern !== lastStyles?.bodyPattern &&
            tile.preset !== last.preset &&
            (tile.band !== "themes" ||
              shelf(tile) !== shelf(last) ||
              left.length < 3) &&
            // Art alternates with logos, borders and options.
            (tile.band !== "art" ||
              Boolean(tile.art) !== Boolean(last.art) ||
              left.every((t) => Boolean(t.art) === Boolean(tile.art)))
          );
        })
      : 0;
    ordered.push(...left.splice(Math.max(index, 0), 1));
  }
  return ordered;
}

const shelf = (tile: WallTile) => tile.detail;

/**
 * Splits placements, in order, into `count` runs whose aspect sums are as
 * even as possible (least squares, by dynamic programming).
 */
function evenRuns(
  placements: WallPlacement[],
  count: number,
): WallPlacement[][] {
  const n = placements.length;
  const prefix = [0];
  for (const p of placements) prefix.push((prefix.at(-1) ?? 0) + aspect(p));
  const target = (prefix[n] ?? 0) / count;
  const cost = (from: number, to: number) =>
    ((prefix[to] ?? 0) - (prefix[from] ?? 0) - target) ** 2;
  // best[k][i]: least cost of the first i placements in k runs.
  const best = Array.from({ length: count + 1 }, () =>
    new Array<number>(n + 1).fill(Number.POSITIVE_INFINITY),
  );
  const cut = Array.from({ length: count + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );
  (best[0] as number[])[0] = 0;
  for (let k = 1; k <= count; k++) {
    for (let i = k; i <= n; i++) {
      for (let j = k - 1; j < i; j++) {
        const value =
          (best[k - 1]?.[j] ?? Number.POSITIVE_INFINITY) + cost(j, i);
        if (value < (best[k]?.[i] ?? Number.POSITIVE_INFINITY)) {
          (best[k] as number[])[i] = value;
          (cut[k] as number[])[i] = j;
        }
      }
    }
  }
  const runs: WallPlacement[][] = [];
  let end = n;
  for (let k = count; k > 0; k--) {
    const start = cut[k]?.[end] ?? 0;
    runs.unshift(placements.slice(start, end));
    end = start;
  }
  return runs;
}

/** A plain square code, which reads as well on a wide backdrop. */
const widenable = (p: WallPlacement) =>
  p.shape === "square" && !p.tile.art && !p.tile.transparent && !p.tile.print;

/**
 * Justified rows of about ROW_TARGET each: split as evenly as the tiles'
 * own shapes allow, then a plain square in a row that comes out short
 * turns wide, which evens the rows and gives a band the home wall's
 * rhythm instead of a grid of squares. Each row is halved where its two
 * sides come closest (the half-rows smaller screens show).
 */
export function justifiedRows(tiles: WallTile[]): WallRow[] {
  const placements = tiles.map((tile) => ({
    tile,
    shape: tile.shape,
    compact: true,
  }));
  const total = placements.reduce((acc, p) => acc + aspect(p), 0);
  const count = Math.max(1, Math.round(total / (ROW_TARGET - 0.4)));
  return evenRuns(placements, count).map((row) => {
    let sum = row.reduce((acc, p) => acc + aspect(p), 0);
    const short = ROW_TARGET - sum;
    if (short > 0.3) {
      const middle = Math.floor(row.length / 2);
      const order = row
        .map((p, i) => ({ p, i }))
        .filter(({ p }) => widenable(p))
        .sort((a, b) => Math.abs(a.i - middle) - Math.abs(b.i - middle));
      for (const { p } of order) {
        if (ROW_TARGET - sum <= 0.3) break;
        p.shape = "wide";
        sum += TILE_ASPECT.wide - TILE_ASPECT.square;
      }
    }
    return {
      halves: row.length > 1 ? evenRuns(row, 2) : [row],
      compact: true,
    };
  });
}

export interface WallSection {
  band: WallBand;
  /** Anchor: /community#made-with-qrdx-<band> */
  id: string;
  title: string;
  description: string;
  rows: WallRow[];
  count: number;
}

const BANDS: { band: WallBand; title: string; description: string }[] = [
  {
    band: "themes",
    title: "Themes",
    description: "Every built-in theme. Open one to start from it.",
  },
  {
    band: "frames",
    title: "Frames",
    description: "QRdx's official frames, free under CC0. Open one to use it.",
  },
  {
    band: "art",
    title: "Art, logos and borders",
    description:
      "Logo QR and Image QR in every variant, center logos, border templates, and transparent and print-ready codes.",
  },
  {
    band: "content",
    title: "Content types and pages",
    description:
      "Every kind of content a code can hold, and the pages QRdx hosts. Open one to start from it.",
  },
];

export const COMMUNITY_WALL: WallSection[] = BANDS.map(
  ({ band, title, description }) => {
    const tiles = WALL_TILES.filter((tile) => tile.band === band);
    return {
      band,
      id: `made-with-qrdx-${band}`,
      title,
      description,
      rows: justifiedRows(interleave(tiles)),
      count: tiles.length,
    };
  },
);

/** Every placement of a wall, row by row. */
export const wallPlacements = (rows: WallRow[]): WallPlacement[] =>
  rows.flatMap((row) => row.halves.flat());
