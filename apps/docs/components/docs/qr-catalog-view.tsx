"use client";

import { Close, Tick } from "@repo/design-system/components/icons";
import { ModuleOrbit } from "@repo/design-system/components/loaders";
import { cn } from "@repo/design-system/lib/utils";
import { getQRAsSVGDataUri, handleImageLoad, type QRProps } from "qrdx";
import { useEffect, useMemo, useState } from "react";
import {
  CATALOG_VALUE,
  type CatalogTile,
  catalogTileSrc,
  type QrCatalogKind,
  tileSize,
  tilesFor,
} from "./qr-catalog-tiles";

// Live catalogue of every body pattern, eye, eye centre and frame, drawn by
// the real renderer. Each tile is also decoded in the browser (jsQR on a
// canvas render, via qrdx's handleImageLoad), one at a time, so the "Scans"
// badge is a real result on the reader's machine, not a claim. Each code
// links into the playground; the links come from the server
// (./qr-catalog.tsx), so the link code never ships to the browser.
//
// The codes the page shows are the engine's own SVGs as files
// (app/catalog/[file]/route.ts), loaded as lazy images: inline, eighty of
// them made the page's HTML 3 MB.

const CHECK_SIZE = 360;

/** Tiles of the first catalogue (body patterns) on the first screen. */
const FIRST_SCREEN = 4;

type Status = "checking" | "scans" | "no-read";

async function decodes(props: QRProps): Promise<boolean> {
  const uri = await getQRAsSVGDataUri({ ...props, size: CHECK_SIZE });
  const image = new Image();
  image.src = uri;
  try {
    await image.decode();
  } catch {
    return false;
  }
  return (await handleImageLoad(image, CHECK_SIZE)) === CATALOG_VALUE;
}

/** Decodes each tile in turn; results arrive as they finish. */
function useScanResults(tiles: CatalogTile[]) {
  const [results, setResults] = useState<Record<string, Status>>({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const tile of tiles) {
        if (cancelled) {
          return;
        }
        let ok = false;
        try {
          ok = await decodes(tile.props);
        } catch {
          ok = false;
        }
        if (!cancelled) {
          setResults((previous) => ({
            ...previous,
            [tile.id]: ok ? "scans" : "no-read",
          }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tiles]);
  return results;
}

function ScanBadge({ status }: { status: Status }) {
  if (status === "checking") {
    return (
      <span className="text-fd-muted-foreground inline-flex items-center gap-1 text-[11px]">
        <ModuleOrbit aria-hidden className="size-3" />
        Checking
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[11px] font-medium",
        status === "scans"
          ? "border-fd-border text-fd-foreground"
          : "border-fd-foreground/40 text-fd-foreground",
      )}
      title={
        status === "scans"
          ? "Decoded with jsQR in your browser"
          : "jsQR could not read this tile in your browser"
      }
    >
      {status === "scans" ? (
        <Tick className="size-3" />
      ) : (
        <Close className="size-3" />
      )}
      {status === "scans" ? "Scans" : "No read"}
    </span>
  );
}

export function QrCatalogView({
  kind,
  hrefs,
}: {
  kind: QrCatalogKind;
  /** Each tile's playground link, by tile id. */
  hrefs: Record<string, string>;
}) {
  const tiles = useMemo(() => tilesFor(kind), [kind]);
  const results = useScanResults(tiles);
  const checked = tiles.filter((tile) => results[tile.id]).length;
  const scanned = tiles.filter((tile) => results[tile.id] === "scans").length;

  return (
    <div className="not-prose my-6">
      <p className="text-fd-muted-foreground mb-3 text-sm" aria-live="polite">
        {checked < tiles.length
          ? `Checking ${checked + 1} of ${tiles.length} in your browser…`
          : `${scanned} of ${tiles.length} decoded with jsQR in your browser.`}
      </p>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {tiles.map((tile, index) => (
          <li
            className="bg-fd-card border-fd-border flex min-w-0 flex-col gap-2 rounded-xl border p-2"
            data-catalog-tile={tile.id}
            data-scan={results[tile.id] ?? "checking"}
            key={tile.id}
          >
            {/* The code opens the playground with this one option set. */}
            <a
              aria-label={`Open ${tile.label} in the playground`}
              className="grid aspect-square place-items-center overflow-hidden rounded-lg bg-white p-3 transition-shadow hover:ring-1 hover:ring-fd-foreground/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring"
              href={hrefs[tile.id]}
            >
              {/* Decorative: the link's label names the option. */}
              <img
                alt=""
                className="h-auto max-h-full max-w-full"
                decoding="async"
                loading={
                  kind === "body" && index < FIRST_SCREEN ? "eager" : "lazy"
                }
                src={catalogTileSrc(tile)}
                width={tileSize(kind)}
              />
            </a>
            <div className="flex min-w-0 flex-col gap-1 px-1 pb-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">
                  {tile.label}
                </span>
                <ScanBadge status={results[tile.id] ?? "checking"} />
              </div>
              <code className="text-fd-muted-foreground truncate font-mono text-[11px]">
                {tile.code}
              </code>
              <span className="text-fd-muted-foreground text-[11px]">
                {tile.category}
                {tile.note ? " · caution" : ""}
              </span>
              {tile.note && (
                <span className="text-fd-muted-foreground text-[11px] leading-snug">
                  {tile.note}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
