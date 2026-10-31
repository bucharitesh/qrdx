"use client";

import { Close, Spinner, Tick } from "@repo/design-system/components/icons";
import { cn } from "@repo/design-system/lib/utils";
import {
  getQRAsSVGDataUri,
  handleImageLoad,
  QRCodeSVG,
  type QRProps,
} from "qrdx";
import { useEffect, useMemo, useState } from "react";
import {
  BODY_CATALOG,
  DOT_CATALOG,
  EYE_CATALOG,
  FRAME_CATALOG,
} from "@/lib/pattern-catalog";

// Live catalogue of every body pattern, eye, eye centre and frame, drawn by
// the real renderer. Each tile is also decoded in the browser (jsQR on a
// canvas render, via qrdx's handleImageLoad), one at a time, so the "Scans"
// badge is a real result on the reader's machine, not a claim.

const VALUE = "https://qrdx.dev/docs/styles";
const CHECK_SIZE = 360;

const PLAIN = {
  bodyPattern: "square",
  cornerEyePattern: "square",
  cornerEyeDotPattern: "square",
} as const;

type Status = "checking" | "scans" | "no-read";

interface Tile {
  id: string;
  label: string;
  /** The prop and value to copy, e.g. bodyPattern="liquid" */
  code: string;
  category: string;
  note?: string;
  props: QRProps;
}

export type QrCatalogKind = "body" | "eye" | "dot" | "frame";

function tilesFor(kind: QrCatalogKind): Tile[] {
  switch (kind) {
    case "body":
      return BODY_CATALOG.map((item) => ({
        id: `body-${item.value}`,
        label: item.label,
        code: `bodyPattern="${item.value}"`,
        category: item.category,
        note: item.note,
        props: { value: VALUE, ...PLAIN, bodyPattern: item.value },
      }));
    case "eye":
      return EYE_CATALOG.map((item) => ({
        id: `eye-${item.value}`,
        label: item.label,
        code: `cornerEyePattern="${item.value}"`,
        category: item.category,
        note: item.note,
        props: {
          value: VALUE,
          ...PLAIN,
          cornerEyePattern: item.value,
          cornerEyeDotPattern: item.recommendedDot,
        },
      }));
    case "dot":
      return DOT_CATALOG.map((item) => ({
        id: `dot-${item.value}`,
        label: item.label,
        code: `cornerEyeDotPattern="${item.value}"`,
        category: item.category,
        note: item.note,
        props: { value: VALUE, ...PLAIN, cornerEyeDotPattern: item.value },
      }));
    default:
      return FRAME_CATALOG.map((item) => ({
        id: `frame-${item.value}`,
        label: item.label,
        code: `frame={{ style: "${item.value}" }}`,
        category: item.category,
        props: {
          value: VALUE,
          ...PLAIN,
          frame: {
            style: item.value,
            text: "Scan me",
            ...(item.secondLine && { secondaryText: "qrdx.dev" }),
          },
        },
      }));
  }
}

async function decodes(props: QRProps): Promise<boolean> {
  const uri = await getQRAsSVGDataUri({ ...props, size: CHECK_SIZE });
  const image = new Image();
  image.src = uri;
  try {
    await image.decode();
  } catch {
    return false;
  }
  return (await handleImageLoad(image, CHECK_SIZE)) === VALUE;
}

/** Decodes each tile in turn; results arrive as they finish. */
function useScanResults(tiles: Tile[]) {
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
        <Spinner className="size-3" />
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

export function QrCatalog({ kind }: { kind: QrCatalogKind }) {
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
        {tiles.map((tile) => (
          <li
            className="bg-fd-card border-fd-border flex min-w-0 flex-col gap-2 rounded-xl border p-2"
            data-catalog-tile={tile.id}
            data-scan={results[tile.id] ?? "checking"}
            key={tile.id}
          >
            <div className="grid aspect-square place-items-center overflow-hidden rounded-lg bg-white p-3 [&_svg]:h-auto [&_svg]:max-h-full [&_svg]:max-w-full">
              <QRCodeSVG {...tile.props} size={kind === "frame" ? 120 : 132} />
            </div>
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
