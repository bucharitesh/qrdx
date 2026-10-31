// Shared plumbing for the decorative effects: environment checks, theme-aware
// colors, canvas sizing and a frame loop that only runs while there is work.

export type RGB = readonly [number, number, number];

export const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const FINE_POINTER = "(hover: hover) and (pointer: fine)";

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" && window.matchMedia(REDUCED_MOTION).matches
  );
}

/** True for a mouse or trackpad; touch-only devices get the static frame. */
export function hasFinePointer(): boolean {
  return (
    typeof window !== "undefined" && window.matchMedia(FINE_POINTER).matches
  );
}

/** Interactive only with a fine pointer and without reduced motion. */
export function isInteractive(): boolean {
  return hasFinePointer() && !prefersReducedMotion();
}

let probe: CanvasRenderingContext2D | null = null;

/**
 * Resolves the CSS `color` of `el` (any color syntax the browser knows,
 * oklch included) to sRGB by painting one pixel.
 */
export function readColor(el: Element, fallback: RGB = [128, 128, 128]): RGB {
  const css = getComputedStyle(el).color;
  if (!probe) {
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    probe = c.getContext("2d", { willReadFrequently: true });
  }
  if (!probe || !css) return fallback;
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = "#808080";
  probe.fillStyle = css;
  probe.fillRect(0, 0, 1, 1);
  const [r = 128, g = 128, b = 128] = probe.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}

/** Relative luminance, 0 (black) … 1 (white). */
export function luminance([r, g, b]: RGB): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export function rgba([r, g, b]: RGB, a: number): string {
  return `rgba(${r},${g},${b},${a})`;
}

/** Calls `cb` when the site theme (class on <html>) or the OS scheme changes. */
export function observeTheme(cb: () => void): () => void {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style", "data-theme"],
  });
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  return () => {
    mo.disconnect();
    mq.removeEventListener("change", cb);
  };
}

/** Calls `cb(visible)` as `el` enters and leaves the viewport (with margin). */
export function observeVisibility(
  el: Element,
  cb: (visible: boolean) => void,
  rootMargin = "120px",
): () => void {
  if (typeof IntersectionObserver === "undefined") {
    cb(true);
    return () => {};
  }
  const io = new IntersectionObserver(
    ([entry]) => cb(Boolean(entry?.isIntersecting)),
    { rootMargin },
  );
  io.observe(el);
  return () => io.disconnect();
}

/** Calls `cb(width, height)` in CSS px whenever `el` changes size. */
export function observeSize(
  el: Element,
  cb: (width: number, height: number) => void,
): () => void {
  const ro = new ResizeObserver(([entry]) => {
    if (!entry) return;
    const { width, height } = entry.contentRect;
    cb(width, height);
  });
  ro.observe(el);
  return () => ro.disconnect();
}

/** Sizes a canvas backing store for the device pixel ratio (capped at 2). */
export function sizeCanvas(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
): number {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(width * dpr));
  const h = Math.max(1, Math.round(height * dpr));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  return dpr;
}

/**
 * A requestAnimationFrame loop that sleeps: `tick(now, dt)` returns whether
 * another frame is needed, and `wake()` restarts it after it stopped.
 */
export function createLoop(tick: (now: number, dt: number) => boolean) {
  let raf = 0;
  let last = 0;
  const frame = (now: number) => {
    const dt = last ? Math.min(now - last, 64) : 16.7;
    last = now;
    raf = tick(now, dt) ? requestAnimationFrame(frame) : 0;
    if (!raf) last = 0;
  };
  return {
    wake() {
      if (!raf) raf = requestAnimationFrame(frame);
    },
    stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
    },
  };
}

/** Frame-rate independent exponential approach (k = fraction per 16.7ms). */
export function approach(from: number, to: number, k: number, dt: number) {
  return to + (from - to) * (1 - k) ** (dt / 16.7);
}

export const smoothstep = (t: number) => t * t * (3 - 2 * t);

/** Cheap deterministic hash → 0…1. */
export function hash2(x: number, y: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Smooth 2D value noise → 0…1. */
export function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const u = smoothstep(x - xi);
  const v = smoothstep(y - yi);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/**
 * Tracks a mouse/pen pointer over `host` in CSS px relative to `frame`
 * (default: the host itself). Touch is ignored. Listeners are passive and
 * only record values; drawing happens in the frame loop.
 */
export function trackPointer(
  host: HTMLElement,
  onChange: (inside: boolean) => void,
  frame: Element = host,
) {
  const state = { x: -1e4, y: -1e4, inside: false, moved: 0 };
  let rect: DOMRect | null = null;
  const move = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    rect = frame.getBoundingClientRect();
    state.x = e.clientX - rect.left;
    state.y = e.clientY - rect.top;
    state.moved = performance.now();
    if (!state.inside) state.inside = true;
    onChange(true);
  };
  const leave = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    state.inside = false;
    onChange(false);
  };
  host.addEventListener("pointermove", move, { passive: true });
  host.addEventListener("pointerleave", leave, { passive: true });
  return {
    state,
    dispose() {
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerleave", leave);
    },
  };
}
