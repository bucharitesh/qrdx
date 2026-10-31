"use client";

import { type ReactNode, useCallback, useState } from "react";
import { BatRoost, ROOST_WIDTH } from "./bats";
import { SittingCat } from "./cat";
import { FloatGhost, type GhostPlacement } from "./ghost";
import { SpiderWeb } from "./glyphs";
import { HalloweenHeaderChrome } from "./header-chrome";
import { type SlotSizes, useSiteSlots } from "./site-slots";
import { SpiderRope } from "./spider-rope";
import { useHalloweenOn } from "./use-halloween";

const GHOST_SIZE = 36;
const GHOST_DRIFT = 4;
const CAT_SIZE = 48;

const SIZES: SlotSizes = {
  top: { width: ROOST_WIDTH, height: 80 },
  mid: {
    width: GHOST_SIZE,
    height: GHOST_SIZE * (512 / 431),
    drift: GHOST_DRIFT,
  },
  bottom: { width: CAT_SIZE, height: CAT_SIZE * (512 / 295) },
};

/** The fixed, pointer-events-none layer every marketing season draws on. */
export function SeasonStage({
  children,
}: {
  children: (stage: HTMLDivElement) => ReactNode;
}) {
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  return (
    <div
      ref={setStage}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-30 overflow-hidden select-none"
    >
      {stage && children(stage)}
    </div>
  );
}

/** Fine web in the top-left corner of the content rail. */
export function CornerWeb({ x, size }: { x: number; size: number }) {
  return (
    <SpiderWeb
      className="absolute top-0 text-foreground/20"
      style={{ left: x, width: size, height: size }}
    />
  );
}

function HalloweenScene({ stage }: { stage: HTMLDivElement }) {
  const slots = useSiteSlots(stage, SIZES);
  const ghostSpot = slots?.mid ?? null;
  const ghostPlacement: GhostPlacement = useCallback(
    () => ghostSpot,
    [ghostSpot],
  );
  if (!slots) return null;
  return (
    <>
      <CornerWeb x={slots.web.x} size={slots.web.size} />
      {slots.hang && (
        <SpiderRope
          stage={stage}
          anchor={slots.hang.anchor}
          rest={slots.hang.rest}
        />
      )}
      {slots.top && <BatRoost stage={stage} roost={slots.top} />}
      {slots.mid && (
        <FloatGhost
          placement={ghostPlacement}
          size={GHOST_SIZE}
          drift={GHOST_DRIFT}
        />
      )}
      {slots.bottom && (
        <SittingCat stage={stage} right={slots.bottom.right} size={CAT_SIZE} />
      )}
    </>
  );
}

/**
 * Halloween on marketing pages: characters on a fixed layer (scrolling never
 * moves them). Web + spider at the top-left of the content rail, bats roosting
 * in the right gutter, a ghost floating in the left gutter, a cat on a free
 * bottom corner.
 */
export function HalloweenSiteCharacters() {
  const on = useHalloweenOn();
  if (!on) return null;
  return (
    <>
      <HalloweenHeaderChrome />
      <SeasonStage>{(stage) => <HalloweenScene stage={stage} />}</SeasonStage>
    </>
  );
}
