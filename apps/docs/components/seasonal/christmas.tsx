"use client";

import { cn } from "@repo/design-system/lib/utils";
import { QRCodeSVG } from "qrdx";
import { type CSSProperties, type RefObject, useEffect, useRef } from "react";
import type { AvoidRects } from "./cat";
import { seasonalCue } from "./cue";
import { HangingCharacter } from "./rope";
import styles from "./seasonal.module.css";
import { SeasonStage } from "./site-characters";
import { type SlotSizes, useSiteSlots } from "./site-slots";
import { Sprite } from "./sprite";
import { addTick, prefersReducedMotion } from "./ticker";

export const TREE_WIDTH = 38;
const TREE_RATIO = 512 / 309;
export const SNOWMAN_WIDTH = 38;
const SNOWMAN_RATIO = 512 / 308;
const GIFT_WIDTH = 40;
const GIFT_RATIO = 512 / 436;
const BAUBLE_WIDTH = 24;
const BAUBLE_RATIO = 512 / 404;

// Where the tree's lights are in its render (309×512 px).
const LIGHTS = [
  [160, 30],
  [86, 197],
  [223, 142],
  [231, 205],
  [229, 294],
  [274, 318],
  [224, 414],
];
const LIGHT_IDS = LIGHTS.map((_, i) => `light-${i}`);
// The snowman's coal eyes in its render (308×512 px): centre and radius.
const SNOWMAN_EYES = [
  { id: "left", cx: 109, cy: 151, r: 12 },
  { id: "right", cx: 199, cy: 150, r: 12 },
];

const overlaps = (a: DOMRect, b: DOMRect, pad = 0) =>
  a.left < b.right + pad &&
  a.right > b.left - pad &&
  a.top < b.bottom + pad &&
  a.bottom > b.top - pad;

/** Hide a character while it would overlap anything in `avoid`. */
export function useKeepClear(
  ref: RefObject<HTMLElement | null>,
  avoid?: AvoidRects,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !avoid) return;
    const check = () => {
      const rect = el.getBoundingClientRect();
      el.style.visibility = avoid().some((block) => overlaps(rect, block, 8))
        ? "hidden"
        : "";
    };
    check();
    const timer = window.setInterval(check, 2000);
    window.addEventListener("resize", check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", check);
    };
  }, [ref, avoid]);
}

/** A small tree on a snow mound; its lights twinkle, a click makes them sparkle. */
export function ChristmasTree({ left, top }: { left: number; top: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const tree = ref.current;
    if (!tree) return;
    let timer = 0;
    const onClick = () => {
      tree.dataset.sparkle = "true";
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        tree.dataset.sparkle = "false";
      }, 1600);
    };
    tree.addEventListener("click", onClick);
    return () => {
      window.clearTimeout(timer);
      tree.removeEventListener("click", onClick);
    };
  }, []);
  return (
    <div
      ref={ref}
      className={styles.tree}
      data-sparkle="false"
      style={{ left, top, width: TREE_WIDTH }}
    >
      <span className={styles.mound} />
      <div className="relative">
        <Sprite
          name="tree"
          width={TREE_WIDTH}
          height={Math.round(TREE_WIDTH * TREE_RATIO)}
          className="h-auto w-full"
        />
        {LIGHTS.map(([x, y], i) => (
          <span
            key={LIGHT_IDS[i]}
            className={styles.light}
            style={
              {
                left: `${(x / 309) * 100}%`,
                top: `${(y / 512) * 100}%`,
                "--delay": `${-(i * 0.37).toFixed(2)}s`,
              } as CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
}

/** Snowman on a snow mound: its eyes follow the cursor, a click makes it hop. */
export function Snowman({
  style,
  width = SNOWMAN_WIDTH,
  avoid,
}: {
  style: CSSProperties;
  width?: number;
  avoid?: AvoidRects;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useKeepClear(ref, avoid);

  useEffect(() => {
    const snowman = ref.current;
    if (!snowman) return;
    const reduced = prefersReducedMotion();
    let targetX = 0;
    let targetY = 0;
    let eyeX = 0;
    let eyeY = 0;
    let stop: (() => void) | null = null;
    const tick = (dt: number) => {
      const ease = Math.min(1, dt * 14);
      eyeX += (targetX - eyeX) * ease;
      eyeY += (targetY - eyeY) * ease;
      snowman.style.setProperty("--px", `${eyeX.toFixed(2)}px`);
      snowman.style.setProperty("--py", `${eyeY.toFixed(2)}px`);
      if (Math.abs(targetX - eyeX) < 0.05 && Math.abs(targetY - eyeY) < 0.05) {
        stop = null;
        return false;
      }
      return undefined;
    };
    const onMove = (event: PointerEvent) => {
      const rect = snowman.getBoundingClientRect();
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height * 0.3);
      const distance = Math.hypot(dx, dy) || 1;
      const reach = Math.min(1, distance / 140);
      // Offsets in the render's pixels (the overlay shares its viewBox).
      targetX = (dx / distance) * 5 * reach;
      targetY = (dy / distance) * 4 * reach;
      if (!stop) stop = addTick(tick);
    };
    let hopTimer = 0;
    const onClick = () => {
      seasonalCue("seasonal-snowman");
      snowman.dataset.hop = "false";
      requestAnimationFrame(() => {
        snowman.dataset.hop = "true";
      });
      window.clearTimeout(hopTimer);
      hopTimer = window.setTimeout(() => {
        snowman.dataset.hop = "false";
      }, 700);
    };
    if (!reduced)
      window.addEventListener("pointermove", onMove, { passive: true });
    snowman.addEventListener("click", onClick);
    return () => {
      stop?.();
      window.clearTimeout(hopTimer);
      window.removeEventListener("pointermove", onMove);
      snowman.removeEventListener("click", onClick);
    };
  }, []);

  return (
    <div
      ref={ref}
      className={styles.snowman}
      data-hop="false"
      style={{ width, ...style }}
    >
      <span className={styles.mound} />
      <div className={styles.snowmanBody}>
        <Sprite
          name="snowman"
          width={width}
          height={Math.round(width * SNOWMAN_RATIO)}
          className="h-auto w-full"
        />
        {/* Coal eyes redrawn so they can look around */}
        <svg
          aria-hidden
          viewBox="0 0 308 512"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          {SNOWMAN_EYES.map((eye) => (
            <g key={eye.id}>
              <circle cx={eye.cx} cy={eye.cy} r={eye.r + 4} fill="#E7E6E9" />
              <g className={styles.pupil}>
                <circle cx={eye.cx} cy={eye.cy} r={eye.r} fill="#17171A" />
                <circle
                  cx={eye.cx - 3}
                  cy={eye.cy - 4}
                  r={3}
                  fill="#fff"
                  opacity=".8"
                />
              </g>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

/** A gift on the bottom edge; a click lifts its lid to show a tiny real QR card. */
export function Gift({ right }: { right: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const height = Math.round(GIFT_WIDTH * GIFT_RATIO);
  useEffect(() => {
    const gift = ref.current;
    if (!gift) return;
    let timer = 0;
    const onClick = () => {
      seasonalCue("seasonal-gift");
      const open = gift.dataset.open !== "true";
      gift.dataset.open = String(open);
      window.clearTimeout(timer);
      if (open) {
        timer = window.setTimeout(() => {
          gift.dataset.open = "false";
        }, 3200);
      }
    };
    gift.addEventListener("click", onClick);
    return () => {
      window.clearTimeout(timer);
      gift.removeEventListener("click", onClick);
    };
  }, []);
  const sprite = (
    <Sprite
      name="gift"
      width={GIFT_WIDTH}
      height={height}
      className="h-auto w-full"
    />
  );
  return (
    <div
      ref={ref}
      className={cn(styles.gift, "bottom-0")}
      data-open="false"
      style={{ right, width: GIFT_WIDTH, height }}
    >
      <span className={styles.giftGlow} />
      {/* The box: the render below its lid seam (41% down) */}
      <div className="absolute inset-0 [clip-path:inset(41%_0_0_0)]">
        {sprite}
      </div>
      <span className={styles.giftCard}>
        <span className="grid size-full place-items-center rounded-[3px] bg-white p-[2px] shadow-sm ring-1 ring-black/10">
          <QRCodeSVG value="https://qrdx.dev" size={64} className="size-full" />
        </span>
      </span>
      {/* The lid: the render above the seam, hinged on its left */}
      <div className={cn(styles.giftLid, "[clip-path:inset(0_0_59%_0)]")}>
        {sprite}
      </div>
    </div>
  );
}

const SIZES: SlotSizes = {
  top: { width: TREE_WIDTH, height: TREE_WIDTH * TREE_RATIO },
  mid: { width: SNOWMAN_WIDTH, height: SNOWMAN_WIDTH * SNOWMAN_RATIO },
  bottom: { width: GIFT_WIDTH, height: GIFT_WIDTH * GIFT_RATIO },
  rest: 56,
};

function ChristmasScene({ stage }: { stage: HTMLDivElement }) {
  const slots = useSiteSlots(stage, SIZES);
  if (!slots) return null;
  return (
    <>
      {slots.hang && (
        // Hangs from the top edge above the corner of the content rail.
        <HangingCharacter
          stage={stage}
          anchor={{ x: slots.hang.anchor.x, y: 0 }}
          rest={slots.hang.rest + slots.hang.anchor.y}
          sprite="bauble"
          width={BAUBLE_WIDTH}
          ratio={BAUBLE_RATIO}
          onNear="nudge"
          onClick="swing"
          cue="seasonal-bauble"
          className="drop-shadow-[0_3px_4px_rgb(0_0_0/0.25)]"
        />
      )}
      {slots.top && (
        <ChristmasTree left={slots.top.x - TREE_WIDTH} top={slots.top.y} />
      )}
      {slots.mid && <Snowman style={{ left: slots.mid.x, top: slots.mid.y }} />}
      {slots.bottom && <Gift right={slots.bottom.right} />}
    </>
  );
}

/**
 * Christmas on marketing pages, at the page edges only: a bauble on a thread
 * above the corner of the content rail, a small tree in the right margin, a snowman in the left
 * margin and a gift on a free bottom corner.
 */
export function ChristmasCharacters() {
  return (
    <SeasonStage>{(stage) => <ChristmasScene stage={stage} />}</SeasonStage>
  );
}
