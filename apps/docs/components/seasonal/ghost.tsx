"use client";

import { cn } from "@repo/design-system/lib/utils";
import { motion, useSpring } from "motion/react";
import { type CSSProperties, useEffect, useRef } from "react";
import { soundEvent } from "@/lib/sound/emit";
import styles from "./seasonal.module.css";
import { Sprite } from "./sprite";
import { prefersReducedMotion } from "./ticker";

const RATIO = 512 / 431;
const FLEE_RADIUS = 150;

/** Top-left corner for the ghost in stage coordinates, or null to hide it. */
export type GhostPlacement = (size: number) => {
  x: number;
  y: number;
  /** How far it may flee sideways / up-down (keeps it inside its area) */
  slackX?: number;
  slackY?: number;
} | null;

/**
 * Ghost floating on a lazy figure-8. It springs away from the cursor, turns
 * see-through when you catch it, and says "Boo!" when clicked or tapped.
 */
export function FloatGhost({
  placement,
  size = 44,
  drift = 14,
}: {
  placement: GhostPlacement;
  /** Horizontal reach of the figure-8 (px) */
  drift?: number;
  size?: number;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const fleeX = useSpring(0, { stiffness: 150, damping: 13, mass: 0.7 });
  const fleeY = useSpring(0, { stiffness: 150, damping: 13, mass: 0.7 });

  useEffect(() => {
    const root = rootRef.current;
    const ghost = ghostRef.current;
    if (!root || !ghost) return;
    const reduced = prefersReducedMotion();

    let slackX = 90;
    let slackY = 80;
    const place = () => {
      const spot = placement(size);
      root.style.visibility = spot ? "" : "hidden";
      if (!spot) return;
      root.style.transform = `translate3d(${spot.x}px, ${spot.y}px, 0)`;
      slackX = spot.slackX ?? 90;
      slackY = spot.slackY ?? 80;
    };
    place();
    window.addEventListener("resize", place);
    const replace = window.setInterval(place, 1500);

    let returnTimer = 0;
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const rect = ghost.getBoundingClientRect();
      const dx = rect.left + rect.width / 2 - event.clientX;
      const dy = rect.top + rect.height / 2 - event.clientY;
      const distance = Math.hypot(dx, dy) || 1;
      if (distance > FLEE_RADIUS) return;
      // Spring away from the pointer (stronger the closer it gets).
      const push = (FLEE_RADIUS - distance) * 0.9;
      fleeX.set(
        Math.max(
          -slackX,
          Math.min(slackX, fleeX.get() + (dx / distance) * push * 0.35),
        ),
      );
      // Sideways room is tight in a gutter, so it escapes mostly up or down.
      const vertical =
        dy / distance + (slackX < 30 ? Math.sign(dy || 1) * 0.6 : 0);
      fleeY.set(
        Math.max(
          -slackY,
          Math.min(slackY, fleeY.get() + vertical * push * 0.35),
        ),
      );
      window.clearTimeout(returnTimer);
      returnTimer = window.setTimeout(() => {
        fleeX.set(0);
        fleeY.set(0);
      }, 1100);
    };

    let booTimer = 0;
    const boo = () => {
      soundEvent("boo");
      ghost.dataset.bubble = "true";
      window.clearTimeout(booTimer);
      booTimer = window.setTimeout(() => {
        ghost.dataset.bubble = "false";
      }, 1300);
      if (!reduced) {
        fleeY.set(fleeY.get() - 26);
        window.clearTimeout(returnTimer);
        returnTimer = window.setTimeout(() => {
          fleeX.set(0);
          fleeY.set(0);
        }, 900);
      }
    };
    const caught = (on: boolean) => () => {
      ghost.dataset.caught = String(on);
    };
    const onEnter = caught(true);
    const onLeave = caught(false);

    if (!reduced)
      window.addEventListener("pointermove", onMove, { passive: true });
    ghost.addEventListener("pointerenter", onEnter);
    ghost.addEventListener("pointerleave", onLeave);
    ghost.addEventListener("click", boo);
    return () => {
      window.removeEventListener("resize", place);
      window.clearInterval(replace);
      window.clearTimeout(returnTimer);
      window.clearTimeout(booTimer);
      window.removeEventListener("pointermove", onMove);
      ghost.removeEventListener("pointerenter", onEnter);
      ghost.removeEventListener("pointerleave", onLeave);
      ghost.removeEventListener("click", boo);
    };
  }, [placement, size, fleeX, fleeY]);

  return (
    <div
      ref={rootRef}
      className="absolute top-0 left-0"
      style={{ visibility: "hidden" }}
    >
      <motion.div style={{ x: fleeX, y: fleeY }}>
        <div
          className={styles.fig8x}
          style={
            {
              "--fx": `${drift}px`,
              "--fy": `${Math.max(6, drift * 0.65)}px`,
            } as CSSProperties
          }
        >
          <div className={styles.fig8y}>
            <div
              ref={ghostRef}
              className={cn(styles.ghost, "cursor-pointer")}
              data-caught="false"
              data-bubble="false"
              style={{ width: size }}
            >
              <span
                className={cn(
                  styles.bubble,
                  "rounded-full border bg-background px-2 py-0.5 text-[11px] font-semibold text-foreground shadow-sm",
                )}
              >
                Boo!
              </span>
              <Sprite
                name="ghost"
                width={size}
                height={Math.round(size * RATIO)}
                className="h-auto w-full drop-shadow-[0_8px_14px_rgb(0_0_0/0.22)]"
              />
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
