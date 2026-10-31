"use client";

import { cn } from "@repo/design-system/lib/utils";
import { type ReactNode, useEffect, useRef } from "react";
import type { SoundName } from "@/lib/sound/presets";
import { seasonalCue } from "./cue";
import styles from "./seasonal.module.css";
import { Sprite, type SpriteName } from "./sprite";
import { addTick, prefersReducedMotion } from "./ticker";

// A character on a real thread: a Verlet rope pinned at a fixed anchor (it
// never moves with scrolling). The cursor coming near nudges it or makes it
// drop a little; a click spins it up the thread or sets it swinging.

const SEGMENTS = 10;
const GRAVITY = 1400; // px/s²
const STEP = 1 / 120; // fixed physics step (s)
const DAMPING = 0.99;

export interface Anchor {
  x: number;
  y: number;
}

export function HangingCharacter({
  stage,
  anchor,
  rest,
  sprite,
  width,
  ratio,
  visible = 1,
  onNear = "drop",
  onClick = "spin",
  cue,
  className,
  children,
}: {
  /** Positioned element the anchor is measured in */
  stage: HTMLElement;
  anchor: Anchor;
  /** Resting thread length (px) */
  rest: number;
  sprite: SpriteName;
  width: number;
  /** Render height / width */
  ratio: number;
  /** Share of the render shown, cropped from the top (renders with their own thread) */
  visible?: number;
  onNear?: "drop" | "nudge";
  onClick?: "spin" | "swing";
  cue?: SoundName;
  className?: string;
  children?: ReactNode;
}) {
  const lineRef = useRef<SVGPolylineElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef(anchor);
  anchorRef.current = anchor;
  const height = Math.round(width * ratio);
  const shown = Math.round(height * visible);

  useEffect(() => {
    const line = lineRef.current;
    const body = bodyRef.current;
    if (!line || !body) return;
    const reduced = prefersReducedMotion();
    const a = anchorRef.current;

    // Rope points (index 0 pinned at the anchor, the last one carries the character).
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
      body.style.transform = `translate3d(${(x[SEGMENTS] - width / 2).toFixed(1)}px, ${y[SEGMENTS].toFixed(1)}px, 0) rotate(${angle.toFixed(1)}deg)`;
    };

    const step = (h: number) => {
      const anchorNow = anchorRef.current;
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
        for (let i = 0; i < SEGMENTS; i++) {
          // Inverse masses: the anchor doesn't move, the character is heavier.
          const wa = i === 0 ? 0 : 1;
          const wb = i + 1 === SEGMENTS ? 0.6 : 1;
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
      if (
        motion < 0.01 * SEGMENTS &&
        Math.abs(target - length) < 0.2 &&
        Math.abs(lengthSpeed) < 0.5
      ) {
        stop = null;
        return false;
      }
      return undefined;
    };
    const wake = () => {
      if (!reduced && !stop) stop = addTick(tick);
    };
    const setTarget = (next: number, quick = false) => {
      target = next;
      fast = quick;
      wake();
    };
    const push = (vx: number) => {
      // A sideways impulse on the character (Verlet: shift its previous position).
      px[SEGMENTS] -= vx * STEP;
      wake();
    };
    render();
    if (reduced) return;

    // Cursor nearby: drop a little and climb back, or a nudge in its direction.
    let climbTimer = 0;
    let dropped = false;
    let last: { x: number; t: number } | null = null;
    let nudged = 0;
    const onWindowMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const box = stage.getBoundingClientRect();
      const distance = Math.hypot(
        event.clientX - box.left - x[SEGMENTS],
        event.clientY - box.top - (y[SEGMENTS] + shown / 2),
      );
      const now = performance.now();
      const speed = last
        ? (event.clientX - last.x) / Math.max(1, now - last.t)
        : 0;
      last = { x: event.clientX, t: now };
      if (distance >= 90) return;
      if (onNear === "drop" && !dropped) {
        dropped = true;
        setTarget(rest + 30);
        window.clearTimeout(climbTimer);
        climbTimer = window.setTimeout(() => {
          setTarget(rest);
          climbTimer = window.setTimeout(() => {
            dropped = false;
          }, 1500);
        }, 2600);
      } else if (onNear === "nudge" && now - nudged > 500) {
        nudged = now;
        push(Math.max(-260, Math.min(260, speed * 260)) || 90);
      }
    };

    // Click: spin and scurry up the thread, or a gentle swing.
    let spinTimer = 0;
    const onTap = () => {
      if (cue) seasonalCue(cue);
      if (onClick === "spin") {
        body.dataset.spin = "true";
        setTarget(Math.max(12, rest * 0.25), true);
        window.clearTimeout(spinTimer);
        spinTimer = window.setTimeout(() => {
          body.dataset.spin = "false";
          setTarget(rest);
        }, 2200);
      } else {
        push(Math.random() > 0.5 ? 220 : -220);
      }
    };

    // Gentle gusts.
    let gust = 0;
    const scheduleGust = () => {
      gust = window.setTimeout(
        () => {
          push((Math.random() - 0.5) * 140);
          scheduleGust();
        },
        4000 + Math.random() * 3000,
      );
    };
    scheduleGust();

    window.addEventListener("pointermove", onWindowMove, { passive: true });
    body.addEventListener("click", onTap);
    return () => {
      stop?.();
      window.clearTimeout(gust);
      window.clearTimeout(climbTimer);
      window.clearTimeout(spinTimer);
      window.removeEventListener("pointermove", onWindowMove);
      body.removeEventListener("click", onTap);
    };
  }, [stage, rest, width, shown, onNear, onClick, cue]);

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
        ref={bodyRef}
        className={cn(
          "pointer-events-auto absolute top-0 left-0 origin-top cursor-pointer select-none",
          className,
        )}
        data-spin="false"
        style={{ width, height: shown }}
      >
        <div
          className={cn(styles.spiderBody, visible < 1 && "overflow-hidden")}
        >
          <Sprite
            name={sprite}
            width={width}
            height={height}
            className="absolute bottom-0 left-0"
          />
          {children}
        </div>
      </div>
    </>
  );
}
