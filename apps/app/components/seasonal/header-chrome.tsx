"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SpiderWeb } from "./glyphs";
import { type Anchor, SpiderRope } from "./spider-rope";
import { useHalloweenOn } from "./use-halloween";

/** The nav mega-menu's panel renders inside the header but drops below the bar. */
const POPUP = '[data-slot="navigation-menu-viewport"]';

/** Elements that are part of the bar itself, not our layer or an open menu. */
const inBar = (el: Element, layer: HTMLElement) =>
  !layer.contains(el) && !el.closest(POPUP);

/** Narrowest gap after the logo the spider hangs in (px). */
const MIN_GAP = 56;

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * The first gap after the logo at least MIN_GAP wide, among the bar's own
 * links and buttons. Boxes outside the bar's height (an open menu's links)
 * don't count, so opening a menu never moves the spider.
 */
export function spiderGap(bar: Box, logo: Box, rects: Box[]) {
  const items = rects
    .filter(
      (rect) =>
        rect.right > rect.left &&
        rect.bottom > rect.top &&
        rect.top >= bar.top - 1 &&
        rect.bottom <= bar.bottom + 1,
    )
    .sort((a, b) => a.left - b.left);
  let start = logo.right;
  let end = bar.right;
  for (const rect of items) {
    if (rect.right <= logo.right + 1) continue;
    if (rect.left - start >= MIN_GAP) {
      end = rect.left;
      break;
    }
    start = Math.max(start, rect.right);
  }
  return { start, end, roomy: end - start >= MIN_GAP };
}

function HeaderCharacters({
  header,
  spider,
}: {
  header: HTMLElement;
  spider: boolean;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  const fanRef = useRef<SVGSVGElement>(null);
  const [rope, setRope] = useState<{ anchor: Anchor; rest: number } | null>(
    null,
  );
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const layerEl = layerRef.current;
    const fan = fanRef.current;
    if (!layerEl || !fan) return;
    setLayer(layerEl);
    const logo = header.querySelector<HTMLElement>('a[href="/"]');

    const place = (
      el: HTMLElement | SVGSVGElement,
      x: number,
      y: number,
      show: boolean,
    ) => {
      el.style.display = show ? "" : "none";
      el.style.left = `${Math.round(x)}px`;
      el.style.top = `${Math.round(y)}px`;
    };

    // Positions come from the header's layout only (resize / content changes),
    // never from scrolling.
    const measure = () => {
      const box = header.getBoundingClientRect();
      const logoRect = logo?.getBoundingClientRect();
      if (!logoRect || logoRect.width === 0) {
        layerEl.style.display = "none";
        return;
      }
      layerEl.style.display = "";

      // Spider: hangs inside the header in the first roomy gap after the logo.
      const rects = [...header.querySelectorAll("a, button")]
        .filter((el) => inBar(el, layerEl))
        .map((el) => el.getBoundingClientRect());
      const gap = spiderGap(box, logoRect, rects);
      const roomy = spider && window.innerWidth >= 640 && gap.roomy;
      const anchorX = Math.round(gap.start - box.left + 26);
      place(fan, anchorX - 22, 0, roomy && window.innerWidth >= 640);
      setRope((current) => {
        if (!roomy) return null;
        const rest = Math.round(Math.max(16, box.height * 0.3));
        if (current?.anchor.x === anchorX && current.rest === rest) {
          return current;
        }
        return { anchor: { x: anchorX, y: 0 }, rest };
      });
    };

    const resize = new ResizeObserver(() => measure());
    // Containers too: the marketing navbar narrows into a pill on scroll, which
    // moves its buttons without resizing them. Open menus aren't the bar.
    const watch = () => {
      resize.observe(header);
      for (const el of header.querySelectorAll("a, button, div")) {
        if (inBar(el, layerEl)) resize.observe(el);
      }
    };
    let pending = 0;
    const mutations = new MutationObserver((records) => {
      const own = (node: Node) => {
        const el = node instanceof Element ? node : node.parentElement;
        return !el || !inBar(el, layerEl);
      };
      if (records.every((record) => own(record.target))) return;
      if (pending) return;
      pending = requestAnimationFrame(() => {
        pending = 0;
        watch();
        measure();
      });
    });
    mutations.observe(header, { childList: true, subtree: true });
    watch();
    measure();
    window.addEventListener("resize", measure);
    return () => {
      resize.disconnect();
      mutations.disconnect();
      cancelAnimationFrame(pending);
      window.removeEventListener("resize", measure);
    };
  }, [header, spider]);

  return (
    <div
      ref={layerRef}
      className="pointer-events-none absolute inset-0 z-10 select-none"
    >
      <SpiderWeb
        ref={fanRef}
        kind="fan"
        className="absolute h-[22px] w-11 text-foreground/20"
        style={{ display: "none" }}
      />
      {layer && rope && (
        <SpiderRope stage={layer} anchor={rope.anchor} rest={rope.rest} />
      )}
    </div>
  );
}

/**
 * Jack-o'-lantern by the header actions (and, in the playground, a spider on a
 * thread with its web). Portals into the page's <header>.
 */
export function HalloweenHeaderChrome({
  spider = false,
}: {
  spider?: boolean;
}) {
  const on = useHalloweenOn();
  const [header, setHeader] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setHeader(on ? document.querySelector("header") : null);
  }, [on]);

  if (!on || !header) return null;
  return createPortal(
    <HeaderCharacters header={header} spider={spider} />,
    header,
  );
}
