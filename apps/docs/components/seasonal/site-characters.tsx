"use client";

import { useCallback, useEffect, useState } from "react";
import { BatRoost, ROOST_WIDTH, type RoostBox } from "./bats";
import { SittingCat } from "./cat";
import { FloatGhost, type GhostPlacement } from "./ghost";
import { cornerWebPoint, SpiderWeb } from "./glyphs";
import { HalloweenHeaderChrome } from "./header-chrome";
import { type Anchor, SpiderRope } from "./spider-rope";
import { useHalloweenOn } from "./use-halloween";

const EDGE = 16; // minimum distance from the screen edge
const RAIL_GAP = 8; // minimum distance from the page's vertical rails
const GHOST_SIZE = 36;
const GHOST_DRIFT = 4;
const GHOST_RATIO = 512 / 431;
const CAT_SIZE = 48;
const CAT_RATIO = 512 / 295;
// Announcement bar + header at the top of the page. A constant on purpose: the
// sticky header moves while scrolling and the characters must not.
const HEADER_ZONE = 124;

// Floating UI to keep clear of: cookie card, dialogs, toasts, the feedback launcher.
const OVERLAYS = [
  'section[aria-labelledby="cookie-banner-title"]',
  '[role="dialog"]',
  "[data-sonner-toast]",
  'iframe[src*="featurebase"]',
  '[id*="featurebase" i]',
  '[class*="featurebase" i]',
].join(", ");

interface SiteLayout {
  web: { x: number; size: number };
  spider: { anchor: Anchor; rest: number } | null;
  bats: RoostBox | null;
  ghost: { x: number; y: number; slackX: number; slackY: number } | null;
  cat: { right: number } | null;
}

const overlaps = (a: DOMRect, b: DOMRect, pad = 0) =>
  a.left < b.right + pad &&
  a.right > b.left - pad &&
  a.top < b.bottom + pad &&
  a.bottom > b.top - pad;

/** Rects (viewport coordinates) the characters must keep clear of. */
function reservedRects(width: number, height: number) {
  const rects = [...document.querySelectorAll(OVERLAYS)]
    .map((el) => el.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0 && rect.width < width);
  // The feedback launcher's corner, even before its script has loaded.
  rects.push(new DOMRect(width - 100, height - 100, 100, 100));
  // The Next.js dev badge (development only).
  if (document.querySelector("nextjs-portal")) {
    rects.push(new DOMRect(0, height - 88, 100, 88));
  }
  return rects;
}

/**
 * Positions from the real layout: the content column's rails, the header and
 * fixed widgets. Gutter characters only appear where they fit fully inside the
 * viewport, clear of rails, content and widgets.
 */
function computeLayout(rail: DOMRect): SiteLayout {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const reserved = reservedRects(width, height);
  const webSize = width < 640 ? 40 : 56;
  const web = { x: Math.max(0, rail.left), size: webSize };
  if (width < 640) {
    return { web, spider: null, bats: null, ghost: null, cat: null };
  }

  // A spoke/ring crossing far enough in to keep the spider 16 px+ from the edge.
  const point = cornerWebPoint(webSize, 2, 3);
  const spider = {
    anchor: { x: web.x + point.x, y: point.y },
    rest: 70,
  };
  // Under 1280 px: only the spider in the header.
  if (width < 1280) return { web, spider, bats: null, ghost: null, cat: null };

  const left = { from: EDGE, to: rail.left - RAIL_GAP };
  const right = { from: rail.right + RAIL_GAP, to: width - EDGE };
  const fits = (box: DOMRect) => !reserved.some((r) => overlaps(box, r, 12));

  // Bats: top of the right gutter, just below the header.
  let bats: RoostBox | null = null;
  if (right.to - right.from >= ROOST_WIDTH) {
    const x = right.to - (right.to - right.from - ROOST_WIDTH) / 2;
    const y = HEADER_ZONE;
    const box = new DOMRect(x - ROOST_WIDTH, y - 8, ROOST_WIDTH, 120);
    if (fits(box)) {
      bats = {
        x,
        y,
        minX: right.from,
        maxX: right.to,
        minY: y - 10,
        maxY: y + 100,
      };
    }
  }

  // Ghost: floats in the left gutter.
  let ghost: SiteLayout["ghost"] = null;
  const ghostHeight = GHOST_SIZE * GHOST_RATIO;
  if (left.to - left.from >= GHOST_SIZE + GHOST_DRIFT * 2 + 4) {
    const x = left.from + (left.to - left.from - GHOST_SIZE) / 2;
    const y = Math.round(height * 0.4);
    const slackX = Math.max(
      0,
      (left.to - left.from - GHOST_SIZE) / 2 - GHOST_DRIFT,
    );
    const slackY = 70;
    const box = new DOMRect(
      x - GHOST_DRIFT,
      y - slackY - 10,
      GHOST_SIZE + GHOST_DRIFT * 2,
      ghostHeight + slackY * 2 + 20,
    );
    if (box.top > HEADER_ZONE && box.bottom < height - EDGE && fits(box)) {
      ghost = { x, y, slackX, slackY };
    }
  }

  // Cat: sits on the bottom edge of a gutter, clear of the corner widgets.
  let cat: SiteLayout["cat"] = null;
  const catHeight = CAT_SIZE * CAT_RATIO;
  for (const zone of [right, left]) {
    if (zone.to - zone.from < CAT_SIZE) continue;
    const candidates =
      zone === right
        ? [zone.to - CAT_SIZE, ...reserved.map((r) => r.left - 24 - CAT_SIZE)]
        : [zone.from, ...reserved.map((r) => r.right + 24)];
    const spot = candidates
      .filter((x) => x >= zone.from && x + CAT_SIZE <= zone.to)
      .find((x) =>
        fits(new DOMRect(x, height - catHeight, CAT_SIZE, catHeight)),
      );
    if (spot !== undefined) {
      cat = { right: Math.round(width - spot - CAT_SIZE) };
      break;
    }
  }

  return { web, spider, bats, ghost, cat };
}

/**
 * Marketing pages: characters on a fixed layer (scrolling never moves them).
 * Web + spider at the top-left of the content rail, bats roosting in the right
 * gutter, a ghost floating in the left gutter, a cat on a free bottom corner,
 * and the jack-o'-lantern by the header actions.
 */
export function HalloweenSiteCharacters() {
  const on = useHalloweenOn();
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  const [layout, setLayout] = useState<SiteLayout | null>(null);

  useEffect(() => {
    // The fixed layer sits inside the layout's content column: its parent's
    // edges are the page rails.
    const rail = stage?.parentElement;
    if (!stage || !rail) return;
    const update = () => {
      const next = computeLayout(rail.getBoundingClientRect());
      setLayout((current) =>
        JSON.stringify(current) === JSON.stringify(next) ? current : next,
      );
    };
    update();
    window.addEventListener("resize", update);
    // Widgets (cookie card, feedback launcher) come and go.
    const recheck = window.setInterval(update, 1500);
    return () => {
      window.removeEventListener("resize", update);
      window.clearInterval(recheck);
    };
  }, [stage]);

  const ghostSpot = layout?.ghost ?? null;
  const ghostPlacement: GhostPlacement = useCallback(
    () => ghostSpot,
    [ghostSpot],
  );

  if (!on) return null;

  return (
    <>
      <HalloweenHeaderChrome />
      <div
        ref={setStage}
        aria-hidden
        className="pointer-events-none fixed inset-0 z-30 overflow-hidden select-none"
      >
        {layout && (
          <SpiderWeb
            className="absolute top-0 text-foreground/20"
            style={{
              left: layout.web.x,
              width: layout.web.size,
              height: layout.web.size,
            }}
          />
        )}
        {stage && layout?.spider && (
          <SpiderRope
            stage={stage}
            anchor={layout.spider.anchor}
            rest={layout.spider.rest}
          />
        )}
        {stage && layout?.bats && (
          <BatRoost stage={stage} roost={layout.bats} />
        )}
        {layout?.ghost && (
          <FloatGhost
            placement={ghostPlacement}
            size={GHOST_SIZE}
            drift={GHOST_DRIFT}
          />
        )}
        {stage && layout?.cat && (
          <SittingCat stage={stage} right={layout.cat.right} size={CAT_SIZE} />
        )}
      </div>
    </>
  );
}
