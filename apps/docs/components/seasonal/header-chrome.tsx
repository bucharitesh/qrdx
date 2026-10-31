"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SpiderWeb } from "./glyphs";
import { type Anchor, SpiderRope } from "./spider-rope";
import { useHalloweenOn } from "./use-halloween";

function visibleRects(header: HTMLElement, layer: HTMLElement) {
  return [...header.querySelectorAll<HTMLElement>("a, button")]
    .filter((el) => !layer.contains(el))
    .map((el) => el.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0)
    .sort((a, b) => a.left - b.left);
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
      const rects = visibleRects(header, layerEl);
      const logoRect = logo?.getBoundingClientRect();
      if (!logoRect || logoRect.width === 0) {
        layerEl.style.display = "none";
        return;
      }
      layerEl.style.display = "";

      // Spider: hangs inside the header in the first roomy gap after the logo.
      let gapStart = logoRect.right;
      let gapEnd = box.right;
      for (const rect of rects) {
        if (rect.right <= logoRect.right + 1) continue;
        if (rect.left - gapStart >= 56) {
          gapEnd = rect.left;
          break;
        }
        gapStart = Math.max(gapStart, rect.right);
      }
      const roomy =
        spider && window.innerWidth >= 640 && gapEnd - gapStart >= 56;
      const anchorX = Math.round(gapStart - box.left + 26);
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
    // moves its buttons without resizing them.
    const watch = () => {
      resize.observe(header);
      for (const el of header.querySelectorAll("a, button, div")) {
        if (!layerEl.contains(el)) resize.observe(el);
      }
    };
    let pending = 0;
    const mutations = new MutationObserver((records) => {
      if (records.every((record) => layerEl.contains(record.target))) return;
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
      aria-hidden
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
