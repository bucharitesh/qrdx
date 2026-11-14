// One requestAnimationFrame loop for every seasonal character (snow, bats,
// ropes, the cat). Ticks run only while something moves; rAF itself pauses in
// background tabs. Plain rAF rather than motion's frame loop: snow is on
// every marketing page in winter, and the motion library isn't.

/** Return false to unsubscribe (e.g. once a spring has settled). */
export type Tick = (dt: number) => boolean | undefined;

const ticks = new Set<Tick>();
let frame = 0;
let last = 0;

function process(now: number) {
  // Seconds since the last frame, clamped so a stalled tab doesn't jump.
  const dt = last
    ? Math.min(0.05, Math.max(0.001, (now - last) / 1000))
    : 1 / 60;
  last = now;
  for (const tick of [...ticks]) {
    if (tick(dt) === false) ticks.delete(tick);
  }
  if (ticks.size === 0) {
    frame = 0;
    last = 0;
    return;
  }
  frame = requestAnimationFrame(process);
}

export function addTick(tick: Tick): () => void {
  ticks.add(tick);
  if (!frame) frame = requestAnimationFrame(process);
  return () => {
    ticks.delete(tick);
  };
}

export const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
