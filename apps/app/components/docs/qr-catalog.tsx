import { playgroundHref } from "@/lib/playground-links";
import {
  type LinkableStyle,
  packStyleParam,
} from "@/lib/playground-style-pack";
import {
  type CatalogTile,
  type QrCatalogKind,
  tilesFor,
} from "./qr-catalog-tiles";
import { QrCatalogView } from "./qr-catalog-view";

// The docs style catalogue (<QrCatalog kind="…" /> in content/docs/styles.mdx).
// A server component: it builds each tile's playground link here, so the
// link code stays out of the page's script, and hands the live, decoded
// tiles to ./qr-catalog-view.tsx.

export type { QrCatalogKind } from "./qr-catalog-tiles";

/**
 * The playground with a tile's option on plain square shapes, as the tile
 * draws it. tests/home/marketing-playground-links.test.ts decodes every
 * tile's link the way the playground does.
 */
export function catalogPlaygroundHref(
  tile: Pick<CatalogTile, "props">,
): string {
  const { bodyPattern, cornerEyePattern, cornerEyeDotPattern, frame } =
    tile.props;
  return playgroundHref({
    style: packStyleParam({
      bodyPattern,
      cornerEyePattern,
      cornerEyeDotPattern,
      ...(frame && { frame: frame as LinkableStyle["frame"] }),
    }),
  });
}

export function QrCatalog({ kind }: { kind: QrCatalogKind }) {
  const hrefs = Object.fromEntries(
    tilesFor(kind).map((tile) => [tile.id, catalogPlaygroundHref(tile)]),
  );
  return <QrCatalogView hrefs={hrefs} kind={kind} />;
}
