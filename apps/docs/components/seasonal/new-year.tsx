"use client";

import { type CSSProperties, useEffect, useRef } from "react";
import { ringInYear } from "@/lib/seasonal";
import type { AvoidRects } from "./cat";
import { useKeepClear } from "./christmas";
import { seasonalCue } from "./cue";
import { HangingCharacter } from "./rope";
import styles from "./seasonal.module.css";
import { SeasonStage } from "./site-characters";
import { type SlotSizes, useSiteSlots } from "./site-slots";
import { Sprite } from "./sprite";

/** Fired by the countdown when midnight passes while the page is open. */
export const MIDNIGHT_EVENT = "qrdx:new-year-midnight";

const DISCO_WIDTH = 30;
const DISCO_RATIO = 512 / 433;
export const BOTTLE_WIDTH = 22;
const BOTTLE_RATIO = 512 / 249;
const BALLOONS_WIDTH = 56;
const BALLOONS_RATIO = 263 / 512;
// The balloon render spells 2027; other years skip it until a matching render exists.
const BALLOONS_YEAR = 2027;

const FLECKS = [
  { id: "a", left: "-60%", top: "30%", dx: "-10px", dy: "14px" },
  { id: "b", left: "130%", top: "20%", dx: "12px", dy: "10px" },
  { id: "c", left: "-30%", top: "95%", dx: "-8px", dy: "16px" },
  { id: "d", left: "115%", top: "85%", dx: "10px", dy: "18px" },
  { id: "e", left: "50%", top: "135%", dx: "4px", dy: "14px" },
];

const FIZZ = Array.from({ length: 7 }, (_, i) => ({
  id: `fizz-${i}`,
  dx: `${(i - 3) * 4}px`,
  delay: `${i * 40}ms`,
  size: `${2 + (i % 3)}px`,
}));

/** Champagne bottle on a snow mound; a click pops the cork with a short fizz. */
export function Champagne({
  style,
  width = BOTTLE_WIDTH,
  avoid,
}: {
  style: CSSProperties;
  width?: number;
  avoid?: AvoidRects;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useKeepClear(ref, avoid);
  useEffect(() => {
    const bottle = ref.current;
    if (!bottle) return;
    let timer = 0;
    const onClick = () => {
      seasonalCue("seasonal-cork");
      bottle.dataset.pop = "false";
      requestAnimationFrame(() => {
        bottle.dataset.pop = "true";
      });
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        bottle.dataset.pop = "false";
      }, 1100);
    };
    bottle.addEventListener("click", onClick);
    return () => {
      window.clearTimeout(timer);
      bottle.removeEventListener("click", onClick);
    };
  }, []);
  return (
    <div
      ref={ref}
      className={styles.bottle}
      data-pop="false"
      style={{ width, ...style }}
    >
      <span className={styles.mound} />
      <span className={styles.cork} />
      {FIZZ.map((fizz) => (
        <span
          key={fizz.id}
          className={styles.fizz}
          style={
            {
              "--dx": fizz.dx,
              "--delay": fizz.delay,
              "--size": fizz.size,
            } as CSSProperties
          }
        />
      ))}
      <Sprite
        name="champagne"
        width={width}
        height={Math.round(width * BOTTLE_RATIO)}
        className="relative h-auto w-full"
      />
    </div>
  );
}

/** "2027" balloons bobbing in the right margin; a click gives them a bounce. */
function Balloons({ left, top }: { left: number; top: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const balloons = ref.current;
    if (!balloons) return;
    let timer = 0;
    const onClick = () => {
      seasonalCue("seasonal-balloon");
      balloons.dataset.bounce = "false";
      requestAnimationFrame(() => {
        balloons.dataset.bounce = "true";
      });
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        balloons.dataset.bounce = "false";
      }, 800);
    };
    balloons.addEventListener("click", onClick);
    return () => {
      window.clearTimeout(timer);
      balloons.removeEventListener("click", onClick);
    };
  }, []);
  return (
    <div
      ref={ref}
      className={styles.balloons}
      data-bounce="false"
      style={{ left, top, width: BALLOONS_WIDTH }}
    >
      <div className={styles.balloonsBody}>
        <Sprite
          name="balloons"
          width={BALLOONS_WIDTH}
          height={Math.round(BALLOONS_WIDTH * BALLOONS_RATIO)}
          className="h-auto w-full"
        />
      </div>
    </div>
  );
}

const SIZES: SlotSizes = {
  top: { width: BALLOONS_WIDTH, height: BALLOONS_WIDTH * BALLOONS_RATIO },
  mid: { width: BOTTLE_WIDTH, height: BOTTLE_WIDTH * BOTTLE_RATIO },
  rest: 52,
};

function NewYearScene({ stage }: { stage: HTMLDivElement }) {
  const slots = useSiteSlots(stage, SIZES);
  if (!slots) return null;
  const sprite = "url(/images/seasonal/new-year/discoball.webp)";
  return (
    <>
      {slots.hang && (
        <HangingCharacter
          stage={stage}
          anchor={{ x: slots.hang.anchor.x, y: 0 }}
          rest={slots.hang.rest + slots.hang.anchor.y}
          sprite="discoball"
          width={DISCO_WIDTH}
          ratio={DISCO_RATIO}
          onNear="nudge"
          onClick="swing"
          className="drop-shadow-[0_3px_5px_rgb(0_0_0/0.25)]"
        >
          {/* Slowly turning: a sheen sweeps the mirror tiles, a few faint flecks */}
          <span
            className={styles.discoSheen}
            style={{ "--sprite": sprite } as CSSProperties}
          />
          {FLECKS.map((fleck, i) => (
            <span
              key={fleck.id}
              className={styles.fleck}
              style={
                {
                  left: fleck.left,
                  top: fleck.top,
                  "--dx": fleck.dx,
                  "--dy": fleck.dy,
                  "--delay": `${-i * 1.1}s`,
                } as CSSProperties
              }
            />
          ))}
        </HangingCharacter>
      )}
      {slots.top && ringInYear() === BALLOONS_YEAR && (
        <Balloons left={slots.top.x - BALLOONS_WIDTH} top={slots.top.y} />
      )}
      {slots.mid && (
        <Champagne style={{ left: slots.mid.x, top: slots.mid.y }} />
      )}
    </>
  );
}

/**
 * New Year on marketing pages, at the page edges only: a disco ball on a
 * thread above the corner of the content rail, "2027" balloons in the right
 * margin and a champagne bottle in the left margin. No fireworks or bursts.
 */
export function NewYearCharacters() {
  return <SeasonStage>{(stage) => <NewYearScene stage={stage} />}</SeasonStage>;
}
