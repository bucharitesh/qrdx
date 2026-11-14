"use client";

import { type CSSProperties, useEffect, useRef } from "react";
import { BatArt, batHeight } from "./art";
import { CHARACTER_BUTTON, seasonalCue } from "./cue";
import styles from "./seasonal.module.css";
import { addTick, prefersReducedMotion } from "./ticker";

// Three bats hanging by their feet from the roost's edge, big–small–big:
// each one's centre as an offset from the roost's right end, with a slight
// lean so they don't read as stamped copies.
const SLOTS = [
  { dx: -9, size: 18, tilt: -2 },
  { dx: -28, size: 15, tilt: 3 },
  { dx: -47, size: 18, tilt: -1 },
];
const BAT_IDS = SLOTS.map((_, i) => `bat-${i}`);
export const ROOST_WIDTH = 56;
export const ROOST_HEIGHT = batHeight(18);

/** Roost's right end on its edge, plus the box the flock may flutter in (stage coordinates). */
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
 * Bats roosting upside down from the window's top edge in a page gutter.
 * Hover near them (or click one) and they flutter around as a flock
 * (separation, alignment, cohesion) inside their gutter, dodge the pointer,
 * then hang back up.
 */
export function BatRoost({
  stage,
  roost,
}: {
  stage: HTMLElement;
  roost: RoostBox;
}) {
  const nodes = useRef<(HTMLButtonElement | null)[]>([]);
  const roostRef = useRef(roost);
  roostRef.current = roost;

  useEffect(() => {
    const reduced = prefersReducedMotion();
    const home = (i: number) => ({
      x: roostRef.current.x + SLOTS[i].dx,
      y: roostRef.current.y,
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

    // Click, tap or Enter / Space on a bat: a flutter, and (with motion) the
    // flock takes off. Coming near only startles them, silently.
    let scatterNow: (() => void) | null = null;
    const onTap = () => {
      seasonalCue("bat");
      scatterNow?.();
    };
    for (const node of nodes.current) node?.addEventListener("click", onTap);
    const detach = () => {
      window.removeEventListener("resize", settle);
      for (const node of nodes.current) {
        node?.removeEventListener("click", onTap);
      }
    };
    if (reduced) return detach;

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
        // Stay inside the gutter, wingtips included: never over the rails or content.
        const half = Math.min(SLOTS[i].size * 0.95, (box.maxX - box.minX) / 2);
        bat.x = Math.max(
          box.minX + half,
          Math.min(box.maxX - half, bat.x + bat.vx * dt),
        );
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
    const scatter = () => {
      if (bats.some((bat) => bat.mode === "fly")) return;
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
        pointer.y - (roostNow.y + ROOST_HEIGHT / 2),
      );
      if (near < 70) scatter();
    };
    scatterNow = scatter;
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      stop?.();
      window.clearTimeout(homeTimer);
      window.clearInterval(wanderTimer);
      window.removeEventListener("pointermove", onMove);
      detach();
    };
  }, [stage]);

  return (
    <>
      {SLOTS.map((slot, index) => (
        <button
          key={BAT_IDS[index]}
          ref={(node) => {
            nodes.current[index] = node;
          }}
          type="button"
          aria-label="Bat"
          className={`${styles.bat} ${CHARACTER_BUTTON} text-zinc-900 dark:text-zinc-500`}
          data-mode="roost"
          style={
            { width: slot.size, "--delay": `${-index * 1.3}s` } as CSSProperties
          }
        >
          <BatArt
            width={slot.size}
            hangingClassName={styles.batHanging}
            flyingClassName={styles.batFlying}
          />
        </button>
      ))}
    </>
  );
}
