"use client";

// The one client script behind every QRdx figure on a page. A single
// IntersectionObserver, pointer listener and visibility listener serve all
// of them: figures register on mount. It holds a figure's entrance until the
// figure is first seen ([data-wait]), pauses its loop while it's off screen or
// the tab is hidden ([data-paused]) and, once per animation frame, sets
// --px/--py (-1..1, the pointer relative to each visible figure) for the
// depth layers in hairline.module.css. With reduced motion it does nothing.

import { type ReactNode, useEffect, useRef } from "react";

const figures = new Set<HTMLElement>();
const visible = new Set<HTMLElement>();
let observer: IntersectionObserver | null = null;
let frame = 0;
let pointerX = 0;
let pointerY = 0;

const clamp = (n: number) => Math.max(-1, Math.min(1, n)).toFixed(3);

function paint() {
  frame = 0;
  for (const el of visible) {
    const box = el.getBoundingClientRect();
    const reach = Math.max(box.width, 240) * 1.5;
    el.style.setProperty(
      "--px",
      clamp((pointerX - box.left - box.width / 2) / reach),
    );
    el.style.setProperty(
      "--py",
      clamp((pointerY - box.top - box.height / 2) / reach),
    );
  }
}

function onPointer(event: PointerEvent) {
  if (event.pointerType === "touch") return;
  pointerX = event.clientX;
  pointerY = event.clientY;
  if (!frame && visible.size > 0) frame = requestAnimationFrame(paint);
}

function syncPaused(el: HTMLElement) {
  if (visible.has(el) && document.visibilityState === "visible") {
    delete el.dataset.paused;
  } else {
    el.dataset.paused = "";
  }
}

function onVisibility() {
  for (const el of figures) syncPaused(el);
}

function onIntersect(entries: IntersectionObserverEntry[]) {
  for (const { target, isIntersecting } of entries) {
    const el = target as HTMLElement;
    if (isIntersecting) {
      visible.add(el);
      el.dataset.seen = "";
      // First time on screen: clearing the hold plays the entrance now.
      delete el.dataset.wait;
    } else {
      visible.delete(el);
      if (!("seen" in el.dataset)) el.dataset.wait = "";
    }
    syncPaused(el);
  }
}

function register(el: HTMLElement) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return () => undefined;
  }
  if (figures.size === 0) {
    observer = new IntersectionObserver(onIntersect, { threshold: 0.25 });
    window.addEventListener("pointermove", onPointer, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
  }
  figures.add(el);
  observer?.observe(el);
  return () => {
    figures.delete(el);
    visible.delete(el);
    observer?.unobserve(el);
    if (figures.size > 0) return;
    observer?.disconnect();
    observer = null;
    window.removeEventListener("pointermove", onPointer);
    document.removeEventListener("visibilitychange", onVisibility);
    cancelAnimationFrame(frame);
    frame = 0;
  };
}

/** The figure's slot: decorative, so hidden from assistive tech. */
export function FigureFrame({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    return el ? register(el) : undefined;
  }, []);
  return (
    <div aria-hidden="true" className={className} ref={ref}>
      {children}
    </div>
  );
}
