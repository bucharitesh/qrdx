// Every Halloween character shares motion's frame loop (the same one that drives
// motion/react springs and drag), so there is a single requestAnimationFrame.
// Ticks run only while something moves; rAF itself pauses in background tabs.
import { cancelFrame, frame, frameData } from "motion/react";

/** Return false to unsubscribe (e.g. once a spring has settled). */
export type Tick = (dt: number) => boolean | undefined;

const ticks = new Set<Tick>();
let running = false;

function process() {
  const dt = Math.min(0.05, Math.max(0.001, frameData.delta / 1000));
  for (const tick of [...ticks]) {
    if (tick(dt) === false) ticks.delete(tick);
  }
  if (ticks.size === 0 && running) {
    running = false;
    cancelFrame(process);
  }
}

export function addTick(tick: Tick): () => void {
  ticks.add(tick);
  if (!running) {
    running = true;
    frame.update(process, true);
  }
  return () => {
    ticks.delete(tick);
  };
}

export const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
