"use client";

import { cn } from "@repo/design-system/lib/utils";
import { useEffect, useRef } from "react";
import { soundEvent } from "@/lib/sound/emit";
import styles from "./seasonal.module.css";
import { Sprite } from "./sprite";
import { addTick, prefersReducedMotion } from "./ticker";

const RATIO = 512 / 295;
// The render's eyes, in its own pixels (295×512): iris center and radii.
const EYES = [
  { id: "left", cx: 85, cy: 128.5, rx: 17, ry: 16.5 },
  { id: "right", cx: 179, cy: 127.5, rx: 20, ry: 17.5 },
];

/** Rects (viewport coordinates) a character must never cover. */
export type AvoidRects = () => DOMRect[];

function overlaps(a: DOMRect, b: DOMRect, pad = 0) {
  return (
    a.left < b.right + pad &&
    a.right > b.left - pad &&
    a.top < b.bottom + pad &&
    a.bottom > b.top - pad
  );
}

/**
 * Black cat on the bottom edge. Its eyes follow the cursor across the page and
 * blink now and then; hover for a second and it purrs; click and it meows;
 * keep clicking and it hisses and puffs up.
 */
export function SittingCat({
  stage,
  avoid,
  right = 20,
  size = 52,
}: {
  stage: HTMLElement;
  avoid?: AvoidRects;
  right?: number;
  size?: number;
}) {
  const catRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const cat = catRef.current;
    const bubble = bubbleRef.current;
    if (!cat || !bubble) return;
    const reduced = prefersReducedMotion();

    // Never sit on anything important (QR preview, badges, cookie card…).
    const check = () => {
      const blocks = avoid?.() ?? [];
      const rect = cat.getBoundingClientRect();
      cat.style.visibility = blocks.some((block) => overlaps(rect, block, 8))
        ? "hidden"
        : "";
    };
    check();
    const resize = new ResizeObserver(check);
    resize.observe(stage);
    const recheck = window.setInterval(check, 2000);

    // Pupils ease toward the cursor on the shared frame loop.
    let targetX = 0;
    let targetY = 0;
    let eyeX = 0;
    let eyeY = 0;
    let stopTick: (() => void) | null = null;
    const tick = (dt: number) => {
      const ease = Math.min(1, dt * 14);
      eyeX += (targetX - eyeX) * ease;
      eyeY += (targetY - eyeY) * ease;
      cat.style.setProperty("--px", `${eyeX.toFixed(2)}px`);
      cat.style.setProperty("--py", `${eyeY.toFixed(2)}px`);
      if (Math.abs(targetX - eyeX) < 0.05 && Math.abs(targetY - eyeY) < 0.05) {
        stopTick = null;
        return false;
      }
      return undefined;
    };
    const onMove = (event: PointerEvent) => {
      const rect = cat.getBoundingClientRect();
      const dx = event.clientX - (rect.left + rect.width * 0.45);
      const dy = event.clientY - (rect.top + rect.height * 0.25);
      const distance = Math.hypot(dx, dy) || 1;
      const reach = Math.min(1, distance / 140);
      // Offsets in the render's pixels (the overlay shares its viewBox).
      targetX = (dx / distance) * 7 * reach;
      targetY = (dy / distance) * 4 * reach;
      if (!stopTick) stopTick = addTick(tick);
    };

    // Random blinks.
    let blinkTimer = 0;
    const blink = () => {
      blinkTimer = window.setTimeout(
        () => {
          cat.dataset.blink = "true";
          window.setTimeout(() => {
            cat.dataset.blink = "false";
          }, 140);
          blink();
        },
        2400 + Math.random() * 4200,
      );
    };
    if (!reduced) blink();

    let moodTimer = 0;
    const say = (mood: "meow" | "purr" | "hiss", text: string, ms: number) => {
      cat.dataset.mood = mood;
      bubble.textContent = text;
      cat.dataset.bubble = "true";
      window.clearTimeout(moodTimer);
      moodTimer = window.setTimeout(() => {
        cat.dataset.mood = "idle";
        cat.dataset.bubble = "false";
      }, ms);
    };

    // Hover for a second: purr (until the pointer leaves).
    let purrTimer = 0;
    const onEnter = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      window.clearTimeout(purrTimer);
      purrTimer = window.setTimeout(() => {
        say("purr", "purr…", 60_000);
      }, 1000);
    };
    const onLeave = () => {
      window.clearTimeout(purrTimer);
      if (cat.dataset.mood === "purr") {
        cat.dataset.mood = "idle";
        cat.dataset.bubble = "false";
      }
    };

    // Click: meow. Three quick clicks: hiss and puff up.
    let clicks: number[] = [];
    const onClick = () => {
      soundEvent("meow");
      const now = performance.now();
      clicks = [...clicks.filter((t) => now - t < 1400), now];
      window.clearTimeout(purrTimer);
      if (clicks.length >= 3) {
        clicks = [];
        say("hiss", "Hss!", 1300);
      } else {
        say("meow", "Meow!", 1200);
      }
    };

    if (!reduced)
      window.addEventListener("pointermove", onMove, { passive: true });
    cat.addEventListener("pointerenter", onEnter);
    cat.addEventListener("pointerleave", onLeave);
    cat.addEventListener("click", onClick);
    return () => {
      resize.disconnect();
      window.clearInterval(recheck);
      window.clearTimeout(blinkTimer);
      window.clearTimeout(moodTimer);
      window.clearTimeout(purrTimer);
      stopTick?.();
      window.removeEventListener("pointermove", onMove);
      cat.removeEventListener("pointerenter", onEnter);
      cat.removeEventListener("pointerleave", onLeave);
      cat.removeEventListener("click", onClick);
    };
  }, [stage, avoid]);

  return (
    <div
      ref={catRef}
      className={cn(styles.cat, "cursor-pointer")}
      data-mood="idle"
      data-blink="false"
      data-bubble="false"
      style={{ right, width: size }}
    >
      <span
        ref={bubbleRef}
        className={cn(
          styles.bubble,
          "rounded-full border bg-background px-2 py-0.5 text-[11px] font-semibold text-foreground shadow-sm",
        )}
      >
        Meow!
      </span>
      <div className={styles.catBody}>
        <Sprite
          name="cat"
          width={size}
          height={Math.round(size * RATIO)}
          className="h-auto w-full dark:drop-shadow-[0_0_10px_rgb(167_139_250/0.2)]"
        />
        {/* Eye overlay in the render's own coordinates */}
        <svg
          aria-hidden
          viewBox="0 0 295 512"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          <defs>
            <radialGradient id="hw-cat-iris" cx="50%" cy="45%" r="60%">
              <stop offset="0" stopColor="#F2FF9E" />
              <stop offset=".55" stopColor="#C2EE2C" />
              <stop offset="1" stopColor="#7DA60E" />
            </radialGradient>
          </defs>
          {EYES.map((eye) => (
            <g key={eye.id}>
              <ellipse
                cx={eye.cx}
                cy={eye.cy}
                rx={eye.rx}
                ry={eye.ry}
                fill="url(#hw-cat-iris)"
              />
              <g className={styles.pupil}>
                <ellipse
                  cx={eye.cx}
                  cy={eye.cy}
                  rx={eye.rx * 0.3}
                  ry={eye.ry * 0.82}
                  fill="#0A0E04"
                />
              </g>
              <circle
                cx={eye.cx + eye.rx * 0.32}
                cy={eye.cy - eye.ry * 0.42}
                r={3.4}
                fill="#fff"
                opacity=".9"
              />
              <ellipse
                className={styles.lid}
                cx={eye.cx}
                cy={eye.cy}
                rx={eye.rx + 2}
                ry={eye.ry + 2}
                fill="#16161A"
              />
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
