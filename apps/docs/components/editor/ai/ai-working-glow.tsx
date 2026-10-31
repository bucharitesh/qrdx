"use client";

import { cn } from "@repo/design-system/lib/utils";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useChatContext } from "@/lib/hooks/use-chat-context";

// Apple-Intelligence-style light while the AI works: colour emitted inward
// from the real screen edges. Each layer is a band along the viewport edges
// (it extends past the screen, so the light is brightest right at the edge),
// filled with a turning conic gradient and blurred more than the last, so it
// reads as light, not a frame. The gradient squares rotate with transforms
// only; opacity breathes. Nothing is mounted while idle.

type Phase = "idle" | "working" | "success" | "error" | "fade";

const FADE_IN_MS = 400;
const PULSE_MS = 450;
const FADE_OUT_MS = 700;

const APPLE_GRADIENT =
  "conic-gradient(from 0deg, #0894ff, #c959dd, #ff2e54, #ff9004, #0894ff)";

const GLOW_CSS = `
@keyframes qx-edge-turn { to { transform: translate(-50%, -50%) rotate(1turn); } }
@keyframes qx-edge-breathe { 0%,100% { opacity: .72; } 50% { opacity: 1; } }
@keyframes qx-edge-pulse { 0% { opacity: 0; } 35% { opacity: 1; } 100% { opacity: 0; } }
.qx-edge { transition: opacity ${FADE_IN_MS}ms cubic-bezier(.32,.72,0,1); }
.qx-edge[data-phase="success"], .qx-edge[data-phase="error"], .qx-edge[data-phase="fade"] { transition-duration: ${FADE_OUT_MS}ms; transition-delay: ${PULSE_MS - 100}ms; }
.qx-edge-breathe { animation: qx-edge-breathe 3.4s ease-in-out infinite; }
.qx-edge-spin { animation: qx-edge-turn var(--qx-speed) linear infinite; animation-delay: var(--qx-delay); }
.qx-edge-pulse { animation: qx-edge-pulse ${PULSE_MS + 250}ms ease-out 1 forwards; }
.qx-edge-band { -webkit-mask: linear-gradient(#000 0 0) content-box xor, linear-gradient(#000 0 0); mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0); }
@media (prefers-reduced-motion: reduce) {
  .qx-edge-spin, .qx-edge-breathe { animation: none !important; }
}
`;

/** How far each band reaches past the screen edge (keeps the edge brightest). */
const OVERSCAN = 48;

/** Visible band width and blur per layer: tight light → wide bloom. */
const LAYERS = [
  {
    band: 6,
    blur: 16,
    speed: "6s",
    delay: "0s",
    tone: "opacity-90 dark:opacity-100",
  },
  {
    band: 22,
    blur: 40,
    speed: "8s",
    delay: "-2.6s",
    tone: "opacity-50 dark:opacity-80 max-sm:opacity-35 max-sm:dark:opacity-50",
  },
  {
    band: 52,
    blur: 80,
    speed: "11s",
    delay: "-5.3s",
    tone: "opacity-25 dark:opacity-55 max-sm:hidden",
  },
];

function useGlowPhase(): Phase {
  const { themeInFlight, themeEvent } = useChatContext();
  const [phase, setPhase] = useState<Phase>("idle");
  const showing = useRef(false);
  const lastEvent = useRef(themeEvent?.at ?? 0);
  const [forced, setForced] = useState<Phase | null>(null);

  // Dev-only preview: ?ai-glow=working|success|error
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const value = new URLSearchParams(window.location.search).get("ai-glow");
    if (value === "working" || value === "success" || value === "error") {
      setForced(value);
    }
  }, []);

  // Only a theme generation lights the preview: on while the tool call runs,
  // one pulse when its theme is applied (red if it failed), a plain fade if
  // the request ended any other way (stopped, or a chat-only reply).
  useEffect(() => {
    let finished: Phase | null = null;
    if (themeEvent && themeEvent.at !== lastEvent.current) {
      lastEvent.current = themeEvent.at;
      if (showing.current) {
        finished = themeEvent.kind === "applied" ? "success" : "error";
      }
    }
    if (themeInFlight && !finished) {
      showing.current = true;
      setPhase("working");
      return;
    }
    if (!showing.current) return;
    showing.current = false;
    setPhase(finished ?? "fade");
    const timer = setTimeout(
      () => setPhase("idle"),
      PULSE_MS + FADE_OUT_MS + 100,
    );
    return () => clearTimeout(timer);
  }, [themeInFlight, themeEvent]);

  return forced ?? phase;
}

function Band({
  band,
  blur,
  speed,
  delay,
  gradient,
  className,
}: {
  band: number;
  blur: number;
  speed?: string;
  delay?: string;
  gradient: string;
  className?: string;
}) {
  return (
    <div
      className={cn("absolute", className)}
      style={{ inset: -OVERSCAN, filter: `blur(${blur}px)` }}
    >
      <div
        className="qx-edge-band absolute inset-0 overflow-hidden"
        style={{ padding: OVERSCAN + band }}
      >
        <div
          className={cn(
            "absolute top-1/2 left-1/2 aspect-square w-[160vmax]",
            speed && "qx-edge-spin",
          )}
          style={
            {
              backgroundImage: gradient,
              transform: "translate(-50%, -50%)",
              "--qx-speed": speed,
              "--qx-delay": delay,
            } as CSSProperties
          }
        />
      </div>
    </div>
  );
}

/**
 * Edge light shown while an AI generation runs: inward from the edges of the
 * preview pane (or the viewport). Fades in, breathes while working, pulses
 * once on finish (red-tinted on error) and fades out; unmounted when idle.
 */
export function AIWorkingGlow({
  scope = "region",
  className,
}: {
  /**
   * `region`: fills the nearest positioned parent (the preview pane), light
   * flush with its four edges. `viewport`: the whole screen (/ai).
   */
  scope?: "region" | "viewport";
  className?: string;
}) {
  const phase = useGlowPhase();
  const [visible, setVisible] = useState(false);

  // Mount at opacity 0, then fade in on the next frame.
  useEffect(() => {
    if (phase !== "working") return;
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  useEffect(() => {
    if (phase === "idle") setVisible(false);
  }, [phase]);

  if (phase === "idle") return null;

  const finishing =
    phase === "success" || phase === "error" || phase === "fade";

  const glow = (
    <div
      aria-hidden
      className={cn(
        "qx-edge pointer-events-none inset-0 overflow-hidden",
        scope === "viewport" ? "fixed z-[95]" : "absolute z-20",
        visible && !finishing ? "opacity-100" : "opacity-0",
        className,
      )}
      data-phase={phase}
    >
      <style href="qrdx-ai-working-glow" precedence="default">
        {GLOW_CSS}
      </style>
      <div
        className={cn(
          "absolute inset-0",
          finishing ? "opacity-100" : "qx-edge-breathe",
        )}
      >
        {LAYERS.map((layer) => (
          <Band
            band={layer.band}
            blur={layer.blur}
            className={layer.tone}
            delay={layer.delay}
            gradient={APPLE_GRADIENT}
            key={layer.band}
            speed={layer.speed}
          />
        ))}
      </div>

      {(phase === "success" || phase === "error") && (
        <div className="qx-edge-pulse absolute inset-0">
          <Band
            band={phase === "error" ? 18 : 14}
            blur={28}
            gradient={
              phase === "error"
                ? "linear-gradient(#ff3b30, #ff3b30)"
                : APPLE_GRADIENT
            }
          />
        </div>
      )}
    </div>
  );

  return scope === "viewport" ? createPortal(glow, document.body) : glow;
}
