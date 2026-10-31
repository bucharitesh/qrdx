"use client";

import { type CSSProperties, useEffect, useRef } from "react";
import { soundEvent } from "@/lib/sound/emit";
import { BatArt } from "./art";
import styles from "./seasonal.module.css";
import { addTick, prefersReducedMotion } from "./ticker";

// A loose, organic cluster (never an even row): offsets from the cluster's
// top-right corner, each bat on its own short silk thread.
const SLOTS = [
  { dx: -10, thread: 4, size: 18, tilt: 172 },
  { dx: -27, thread: 13, size: 15, tilt: 189 },
  { dx: -41, thread: 2, size: 17, tilt: 181 },
  { dx: -19, thread: 27, size: 14, tilt: 194 },
  { dx: -35, thread: 31, size: 16, tilt: 168 },
];
const BAT_IDS = SLOTS.map((_, i) => `bat-${i}`);
export const ROOST_WIDTH = 52;

/** Cluster corner plus the box the flock may flutter in (stage coordinates). */
export interface RoostBox {
  x: number;
  y: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

interface Bat {
  mode: "roost" | "fly";
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/**
 * Bats roosting upside down in a page gutter. Hover near them (or click one)
 * and they flutter around as a flock (separation, alignment, cohesion) inside
 * their gutter, dodge the pointer, then settle back on their threads.
 */
export function BatRoost({
  stage,
  roost,
}: {
  stage: HTMLElement;
  roost: RoostBox;
}) {
  const nodes = useRef<(HTMLDivElement | null)[]>([]);
  const roostRef = useRef(roost);
  roostRef.current = roost;

  useEffect(() => {
    const reduced = prefersReducedMotion();
    const home = (i: number) => ({
      x: roostRef.current.x + SLOTS[i].dx,
      y: roostRef.current.y + SLOTS[i].thread,
    });
    const bats: Bat[] = SLOTS.map((_, i) => ({
      mode: "roost",
      ...home(i),
      vx: 0,
      vy: 0,
    }));

    const draw = (bat: Bat, i: number) => {
      const node = nodes.current[i];
      if (!node) return;
      const { size, tilt } = SLOTS[i];
      node.dataset.mode = bat.mode;
      const angle =
        bat.mode === "roost" ? tilt : Math.max(-30, Math.min(30, bat.vx * 0.1));
      node.style.transform = `translate3d(${(bat.x - size / 2).toFixed(1)}px, ${bat.y.toFixed(1)}px, 0) rotate(${angle.toFixed(1)}deg)`;
    };
    const settle = () => {
      bats.forEach((bat, i) => {
        if (bat.mode === "roost") Object.assign(bat, home(i));
        draw(bat, i);
      });
    };
    settle();
    window.addEventListener("resize", settle);
    if (reduced) return () => window.removeEventListener("resize", settle);

    let pointer: { x: number; y: number } | null = null;
    let phase: "out" | "home" = "home";
    let goal = { x: 0, y: 0 };
    let homeTimer = 0;
    let wanderTimer = 0;
    let stop: (() => void) | null = null;

    const tick = (dt: number) => {
      const box = roostRef.current;
      let flying = 0;
      bats.forEach((bat, i) => {
        if (bat.mode === "roost") return;
        flying++;
        let ax = 0;
        let ay = 0;
        let cx = 0;
        let cy = 0;
        let avx = 0;
        let avy = 0;
        let neighbours = 0;
        for (const other of bats) {
          if (other === bat || other.mode === "roost") continue;
          const dx = bat.x - other.x;
          const dy = bat.y - other.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 22 * 22 && d2 > 0) {
            ax += (dx / d2) * 700; // separation
            ay += (dy / d2) * 700;
          }
          if (d2 < 70 * 70) {
            cx += other.x;
            cy += other.y;
            avx += other.vx;
            avy += other.vy;
            neighbours++;
          }
        }
        if (neighbours) {
          ax += (cx / neighbours - bat.x) * 1.2; // cohesion
          ay += (cy / neighbours - bat.y) * 1.2;
          ax += (avx / neighbours - bat.vx) * 0.9; // alignment
          ay += (avy / neighbours - bat.vy) * 0.9;
        }
        const target = phase === "out" ? goal : home(i);
        const tx = target.x - bat.x;
        const ty = target.y - bat.y;
        const td = Math.hypot(tx, ty) || 1;
        ax += (tx / td) * 420;
        ay += (ty / td) * 420;
        if (pointer) {
          const fx = bat.x - pointer.x;
          const fy = bat.y - pointer.y;
          const fd = Math.hypot(fx, fy) || 1;
          if (fd < 90) {
            ax += (fx / fd) * (90 - fd) * 18;
            ay += (fy / fd) * (90 - fd) * 18;
          }
        }
        ax += (Math.random() - 0.5) * 260; // flutter
        ay += (Math.random() - 0.5) * 260;
        bat.vx += ax * dt;
        bat.vy += ay * dt;
        const max =
          phase === "home" ? Math.max(40, Math.min(180, td * 3)) : 180;
        const speed = Math.hypot(bat.vx, bat.vy) || 1;
        if (speed > max) {
          bat.vx = (bat.vx / speed) * max;
          bat.vy = (bat.vy / speed) * max;
        }
        // Stay inside the gutter: never over the page rails or content.
        bat.x = Math.max(box.minX, Math.min(box.maxX, bat.x + bat.vx * dt));
        bat.y = Math.max(box.minY, Math.min(box.maxY, bat.y + bat.vy * dt));
        if (phase === "home" && td < 6) {
          Object.assign(bat, home(i), { mode: "roost", vx: 0, vy: 0 });
        }
        draw(bat, i);
      });
      if (flying === 0) {
        stop = null;
        return false;
      }
      return undefined;
    };

    const wander = () => {
      const box = roostRef.current;
      goal = {
        x: box.minX + Math.random() * (box.maxX - box.minX),
        y: box.minY + Math.random() * (box.maxY - box.minY),
      };
    };
    const scatter = (event?: PointerEvent) => {
      if (bats.some((bat) => bat.mode === "fly")) return;
      if (event) soundEvent("bat"); // a direct click, not proximity
      phase = "out";
      wander();
      for (const bat of bats) {
        bat.mode = "fly";
        bat.vx = (Math.random() - 0.5) * 140;
        bat.vy = 50 + Math.random() * 90;
      }
      window.clearInterval(wanderTimer);
      wanderTimer = window.setInterval(wander, 450);
      window.clearTimeout(homeTimer);
      homeTimer = window.setTimeout(() => {
        phase = "home";
        window.clearInterval(wanderTimer);
      }, 1800);
      if (!stop) stop = addTick(tick);
    };

    const onMove = (event: PointerEvent) => {
      const box = stage.getBoundingClientRect();
      pointer = { x: event.clientX - box.left, y: event.clientY - box.top };
      if (event.pointerType === "touch") return;
      const roostNow = roostRef.current;
      const near = Math.hypot(
        pointer.x - (roostNow.x - ROOST_WIDTH / 2),
        pointer.y - (roostNow.y + 18),
      );
      if (near < 70) scatter();
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    for (const node of nodes.current) {
      node?.addEventListener("pointerdown", scatter);
    }
    return () => {
      stop?.();
      window.clearTimeout(homeTimer);
      window.clearInterval(wanderTimer);
      window.removeEventListener("resize", settle);
      window.removeEventListener("pointermove", onMove);
      for (const node of nodes.current) {
        node?.removeEventListener("pointerdown", scatter);
      }
    };
  }, [stage]);

  return (
    <>
      <svg
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 overflow-visible text-foreground/25"
        width="1"
        height="1"
      >
        {SLOTS.map((slot, i) => (
          <line
            key={BAT_IDS[i]}
            x1={roost.x + slot.dx}
            x2={roost.x + slot.dx}
            y1={roost.y - 6}
            y2={roost.y + slot.thread + 3}
            stroke="currentColor"
            strokeWidth="0.75"
          />
        ))}
      </svg>
      {SLOTS.map((slot, index) => (
        <div
          key={BAT_IDS[index]}
          ref={(node) => {
            nodes.current[index] = node;
          }}
          className={styles.bat}
          data-mode="roost"
          style={{ "--delay": `${-index * 0.7}s` } as CSSProperties}
        >
          <span className={styles.batWings}>
            <BatArt
              size={slot.size}
              className="text-zinc-800 dark:text-zinc-700 dark:drop-shadow-[0_0_1px_rgb(255_255_255/0.55)]"
            />
          </span>
        </div>
      ))}
    </>
  );
}
