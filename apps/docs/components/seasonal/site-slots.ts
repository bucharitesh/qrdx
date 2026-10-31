"use client";

import { useEffect, useState } from "react";
import { cornerWebPoint } from "./glyphs";
import type { Anchor } from "./rope";

// Where seasonal characters may sit on marketing pages: computed from the real
// layout (the content column's rails and fixed widgets), never from scrolling.

const EDGE = 16; // minimum distance from the screen edge
const RAIL_GAP = 8; // minimum distance from the page's vertical rails
// Announcement bar + header at the top of the page. A constant on purpose: the
// sticky header moves while scrolling and the characters must not.
export const HEADER_ZONE = 124;

// Floating UI to keep clear of: cookie card, dialogs, toasts, the feedback launcher.
const OVERLAYS = [
  'section[aria-labelledby="cookie-banner-title"]',
  '[role="dialog"]',
  "[data-sonner-toast]",
  'iframe[src*="featurebase"]',
  '[id*="featurebase" i]',
  '[class*="featurebase" i]',
].join(", ");

export interface Size {
  width: number;
  height: number;
}

/** Top of the right gutter: right end, top, and the box the character may move in. */
export interface TopSlot {
  x: number;
  y: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface SiteSlots {
  web: { x: number; size: number };
  /** Hanging character at the web in the top-left corner of the content rail */
  hang: { anchor: Anchor; rest: number } | null;
  top: TopSlot | null;
  /** Left gutter, mid height (top-left corner) with how far it may drift */
  mid: { x: number; y: number; slackX: number; slackY: number } | null;
  /** Bottom edge of a free gutter corner, as a `right` offset */
  bottom: { right: number } | null;
}

export interface SlotSizes {
  top?: Size;
  mid?: Size & { drift?: number };
  bottom?: Size;
  rest?: number;
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
 * Gutter slots only exist where a character fits fully inside the viewport,
 * clear of the rails, the content and the widgets. Under 1280 px only the
 * hanging character remains; under 640 px only the web corner.
 */
export function computeSlots(rail: DOMRect, sizes: SlotSizes): SiteSlots {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const reserved = reservedRects(width, height);
  const webSize = width < 640 ? 40 : 56;
  const web = { x: Math.max(0, rail.left), size: webSize };
  const none = { top: null, mid: null, bottom: null };
  if (width < 640) return { web, hang: null, ...none };

  // A spoke/ring crossing far enough in to keep the character 16 px+ from the edge.
  const point = cornerWebPoint(webSize, 2, 3);
  const hang = {
    anchor: { x: web.x + point.x, y: point.y },
    rest: sizes.rest ?? 70,
  };
  if (width < 1280) return { web, hang, ...none };

  const left = { from: EDGE, to: rail.left - RAIL_GAP };
  const right = { from: rail.right + RAIL_GAP, to: width - EDGE };
  const fits = (box: DOMRect) => !reserved.some((r) => overlaps(box, r, 12));

  let top: TopSlot | null = null;
  if (sizes.top && right.to - right.from >= sizes.top.width) {
    const { width: w, height: h } = sizes.top;
    const x = right.to - (right.to - right.from - w) / 2;
    const y = HEADER_ZONE;
    if (fits(new DOMRect(x - w, y - 8, w, h + 40))) {
      top = {
        x,
        y,
        minX: right.from,
        maxX: right.to,
        minY: y - 10,
        maxY: y + 100,
      };
    }
  }

  let mid: SiteSlots["mid"] = null;
  if (sizes.mid) {
    const { width: w, height: h, drift = 0 } = sizes.mid;
    if (left.to - left.from >= w + drift * 2 + 4) {
      const x = left.from + (left.to - left.from - w) / 2;
      const y = Math.round(height * 0.4);
      const slackX = Math.max(0, (left.to - left.from - w) / 2 - drift);
      const slackY = 70;
      const box = new DOMRect(
        x - drift,
        y - slackY - 10,
        w + drift * 2,
        h + slackY * 2 + 20,
      );
      if (box.top > HEADER_ZONE && box.bottom < height - EDGE && fits(box)) {
        mid = { x, y, slackX, slackY };
      }
    }
  }

  let bottom: SiteSlots["bottom"] = null;
  if (sizes.bottom) {
    const { width: w, height: h } = sizes.bottom;
    for (const zone of [right, left]) {
      if (zone.to - zone.from < w) continue;
      const candidates =
        zone === right
          ? [zone.to - w, ...reserved.map((r) => r.left - 24 - w)]
          : [zone.from, ...reserved.map((r) => r.right + 24)];
      const spot = candidates
        .filter((x) => x >= zone.from && x + w <= zone.to)
        .find((x) => fits(new DOMRect(x, height - h, w, h)));
      if (spot !== undefined) {
        bottom = { right: Math.round(width - spot - w) };
        break;
      }
    }
  }

  return { web, hang, top, mid, bottom };
}

/** Slots for a fixed stage that sits inside the layout's content column. */
export function useSiteSlots(stage: HTMLElement | null, sizes: SlotSizes) {
  const [slots, setSlots] = useState<SiteSlots | null>(null);
  const key = JSON.stringify(sizes);

  useEffect(() => {
    // The stage's parent's edges are the page rails.
    const rail = stage?.parentElement;
    if (!stage || !rail) return;
    const parsed = JSON.parse(key) as SlotSizes;
    const update = () => {
      const next = computeSlots(rail.getBoundingClientRect(), parsed);
      setSlots((current) =>
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
  }, [stage, key]);

  return slots;
}
