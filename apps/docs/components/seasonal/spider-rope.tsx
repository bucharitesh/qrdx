"use client";

import { cn } from "@repo/design-system/lib/utils";
import { useEffect, useRef } from "react";
import styles from "./seasonal.module.css";
import { Sprite } from "./sprite";
import { addTick, prefersReducedMotion } from "./ticker";

// A spider on a real thread: a Verlet rope pinned at a fixed anchor. Pull it
// down and let go (it bounces and swings back), it drops a little when the
// cursor comes near and climbs back, its legs wiggle on hover, and a click
// makes it spin and scurry up.

const SEGMENTS = 10;
const GRAVITY = 1400; // px/s²
const STEP = 1 / 120; // fixed physics step (s)
const DAMPING = 0.99;
const SWING = 40; // max sideways pull (px)

const SPRITE_RATIO = 512 / 243; // the render, incl. its own silk to the top edge
const VISIBLE = 0.7; // share of the render shown (the legs start ~34% down)

export interface Anchor {
  x: number;
  y: number;
}

export function SpiderRope({
  stage,
  anchor,
  rest,
  width = 22,
}: {
  /** Positioned element the anchor is measured in */
  stage: HTMLElement;
  anchor: Anchor;
  /** Resting thread length (px) */
  rest: number;
  width?: number;
}) {
  const lineRef = useRef<SVGPolylineElement>(null);
  const spiderRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef(anchor);
  const height = Math.round(width * SPRITE_RATIO);
  const visible = Math.round(height * VISIBLE);

  useEffect(() => {
    const line = lineRef.current;
    const spider = spiderRef.current;
    if (!line || !spider) return;
    const reduced = prefersReducedMotion();
    const a = anchorRef.current;

    // Rope points (index 0 pinned at the anchor, last one is the spider).
    const x = new Float64Array(SEGMENTS + 1);
    const y = new Float64Array(SEGMENTS + 1);
    const px = new Float64Array(SEGMENTS + 1);
    const py = new Float64Array(SEGMENTS + 1);
    for (let i = 0; i <= SEGMENTS; i++) {
      x[i] = px[i] = a.x;
      y[i] = py[i] = a.y + (rest * i) / SEGMENTS;
    }
    let length = rest;
    let lengthSpeed = 0;
    let target = rest;
    let fast = false;
    let drag: { x: number; y: number } | null = null;
    let accumulator = 0;

    const render = () => {
      let points = "";
      for (let i = 0; i <= SEGMENTS; i++) {
        points += `${x[i].toFixed(1)},${y[i].toFixed(1)} `;
      }
      line.setAttribute("points", points);
      const dx = x[SEGMENTS] - x[SEGMENTS - 1];
      const dy = y[SEGMENTS] - y[SEGMENTS - 1];
      const angle = (Math.atan2(-dx, dy) * 180) / Math.PI;
      spider.style.transform = `translate3d(${(x[SEGMENTS] - width / 2).toFixed(1)}px, ${y[SEGMENTS].toFixed(1)}px, 0) rotate(${angle.toFixed(1)}deg)`;
    };

    const step = (h: number) => {
      const anchorNow = anchorRef.current;
      // Thread length follows its target on a spring (drop / climb).
      // Release: one soft bounce (ζ≈0.7). Drop/climb: no overshoot.
      const stiffness = fast ? 120 : 26;
      const damping = fast ? 15 : 11;
      lengthSpeed +=
        ((target - length) * stiffness - lengthSpeed * damping) * h;
      length += lengthSpeed * h;
      const segment = Math.max(1, length / SEGMENTS);

      for (let i = 1; i <= SEGMENTS; i++) {
        const vx = (x[i] - px[i]) * DAMPING;
        const vy = (y[i] - py[i]) * DAMPING;
        px[i] = x[i];
        py[i] = y[i];
        x[i] += vx;
        y[i] += vy + GRAVITY * h * h;
      }
      for (let k = 0; k < 14; k++) {
        x[0] = anchorNow.x;
        y[0] = anchorNow.y;
        if (drag) {
          x[SEGMENTS] = drag.x;
          y[SEGMENTS] = drag.y;
        }
        for (let i = 0; i < SEGMENTS; i++) {
          // Inverse masses: the anchor (and a held spider) don't move.
          const wa = i === 0 ? 0 : 1;
          const wb = i + 1 === SEGMENTS ? (drag ? 0 : 0.6) : 1;
          if (wa + wb === 0) continue;
          const dx = x[i + 1] - x[i];
          const dy = y[i + 1] - y[i];
          const distance = Math.hypot(dx, dy) || 0.0001;
          if (distance <= segment) continue; // a thread can go slack
          const correction = (distance - segment) / distance / (wa + wb);
          x[i] += dx * correction * wa;
          y[i] += dy * correction * wa;
          x[i + 1] -= dx * correction * wb;
          y[i + 1] -= dy * correction * wb;
        }
      }
    };

    let stop: (() => void) | null = null;
    const tick = (dt: number) => {
      accumulator += dt;
      while (accumulator >= STEP) {
        step(STEP);
        accumulator -= STEP;
      }
      render();
      let motion = 0;
      for (let i = 1; i <= SEGMENTS; i++) {
        motion += Math.abs(x[i] - px[i]) + Math.abs(y[i] - py[i]);
      }
      const settled =
        !drag &&
        motion < 0.01 * SEGMENTS &&
        Math.abs(target - length) < 0.2 &&
        Math.abs(lengthSpeed) < 0.5;
      if (settled) {
        stop = null;
        return false;
      }
      return undefined;
    };
    const wake = () => {
      if (!reduced && !stop) stop = addTick(tick);
    };
    render();
    if (reduced) return;

    const setTarget = (next: number, quick = false) => {
      target = next;
      fast = quick;
      wake();
    };

    // Gentle gusts.
    let gust = 0;
    const scheduleGust = () => {
      gust = window.setTimeout(
        () => {
          px[SEGMENTS] -= (Math.random() - 0.5) * 1.2;
          wake();
          scheduleGust();
        },
        4000 + Math.random() * 3000,
      );
    };
    scheduleGust();

    // Cursor nearby: drop a little, climb back after a while.
    let climbTimer = 0;
    let dropped = false;
    const onWindowMove = (event: PointerEvent) => {
      if (drag || event.pointerType === "touch") return;
      const box = stage.getBoundingClientRect();
      const distance = Math.hypot(
        event.clientX - box.left - x[SEGMENTS],
        event.clientY - box.top - y[SEGMENTS],
      );
      if (distance < 110 && !dropped) {
        dropped = true;
        setTarget(rest + 30);
        window.clearTimeout(climbTimer);
        climbTimer = window.setTimeout(() => {
          setTarget(rest);
          climbTimer = window.setTimeout(() => {
            dropped = false;
          }, 1500);
        }, 2600);
      }
    };

    // Grab and pull; a click (no pull) spins it and sends it scurrying up.
    let start: { x: number; y: number; t: number } | null = null;
    let pulled = false;
    let spinTimer = 0;
    const toStage = (event: PointerEvent) => {
      const box = stage.getBoundingClientRect();
      const anchorNow = anchorRef.current;
      // A short leash: mostly downward, so the swing never reaches the nav.
      let dx = Math.max(
        -SWING,
        Math.min(SWING, event.clientX - box.left - anchorNow.x),
      );
      let dy = Math.max(0, event.clientY - box.top - anchorNow.y);
      const max = rest * 1.9;
      const distance = Math.hypot(dx, dy);
      if (distance > max) {
        dx = (dx / distance) * max;
        dy = (dy / distance) * max;
      }
      return { x: anchorNow.x + dx, y: anchorNow.y + dy };
    };
    const onDown = (event: PointerEvent) => {
      event.preventDefault();
      spider.setPointerCapture(event.pointerId);
      start = { x: event.clientX, y: event.clientY, t: performance.now() };
      pulled = false;
    };
    const onMove = (event: PointerEvent) => {
      if (!start) return;
      const moved = Math.hypot(
        event.clientX - start.x,
        event.clientY - start.y,
      );
      if (!pulled && moved > 5) pulled = true;
      if (pulled) {
        // The silk stretches with the pull…
        drag = toStage(event);
        const anchorNow = anchorRef.current;
        length = Math.max(
          rest * 0.5,
          Math.hypot(drag.x - anchorNow.x, drag.y - anchorNow.y),
        );
        lengthSpeed = 0;
        target = length;
        wake();
      }
    };
    const onUp = (event: PointerEvent) => {
      if (!start) return;
      const quickTap = !pulled && performance.now() - start.t < 400;
      start = null;
      if (drag) {
        // …and springs back on release, keeping a little of the pull's swing.
        drag = null;
        for (let i = 1; i <= SEGMENTS; i++) {
          px[i] = x[i] - (x[i] - px[i]) * 0.3;
          py[i] = y[i] - (y[i] - py[i]) * 0.3;
        }
        setTarget(rest, true);
      }
      if (spider.hasPointerCapture(event.pointerId)) {
        spider.releasePointerCapture(event.pointerId);
      }
      if (quickTap) {
        spider.dataset.spin = "true";
        setTarget(Math.max(12, rest * 0.25), true);
        window.clearTimeout(spinTimer);
        spinTimer = window.setTimeout(() => {
          spider.dataset.spin = "false";
          setTarget(rest);
        }, 2200);
      }
    };

    window.addEventListener("pointermove", onWindowMove, { passive: true });
    spider.addEventListener("pointerdown", onDown);
    spider.addEventListener("pointermove", onMove);
    spider.addEventListener("pointerup", onUp);
    spider.addEventListener("pointercancel", onUp);
    return () => {
      stop?.();
      window.clearTimeout(gust);
      window.clearTimeout(climbTimer);
      window.clearTimeout(spinTimer);
      window.removeEventListener("pointermove", onWindowMove);
      spider.removeEventListener("pointerdown", onDown);
      spider.removeEventListener("pointermove", onMove);
      spider.removeEventListener("pointerup", onUp);
      spider.removeEventListener("pointercancel", onUp);
    };
  }, [stage, rest, width]);

  // The anchor only changes on resize; the rope follows without re-mounting.
  useEffect(() => {
    anchorRef.current = anchor;
  }, [anchor]);

  return (
    <>
      <svg
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 overflow-visible text-foreground/40"
        width="1"
        height="1"
      >
        <polyline
          ref={lineRef}
          fill="none"
          stroke="currentColor"
          strokeWidth="0.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div
        ref={spiderRef}
        className={cn(
          styles.spider,
          "pointer-events-auto absolute top-0 left-0 origin-top cursor-grab touch-none select-none drop-shadow-[0_2px_3px_rgb(0_0_0/0.35)] active:cursor-grabbing dark:drop-shadow-[0_0_3px_rgb(255_255_255/0.3)]",
        )}
        data-spin="false"
        style={{ width, height: visible }}
      >
        <div className={cn(styles.spiderBody, "overflow-hidden")}>
          <Sprite
            name="spider"
            width={width}
            height={height}
            className="absolute bottom-0 left-0"
          />
        </div>
      </div>
    </>
  );
}
