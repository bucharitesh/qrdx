"use client";

import { Play, Tick } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { Pause } from "iconsax-reactjs";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { QRDX_QR_H } from "@/components/fx";
import { QrdxLogo } from "@/components/qrdx-logo";

// A real QR code for https://qrdx.dev (version 3, error correction H, encoded
// by the qrdx encoder) drawn module by module, so it can restyle itself with
// CSS transitions alone: React only flips a few data attributes per stage.
// Every stage stays scannable; H leaves room for the logo knock-out.

const MATRIX = QRDX_QR_H;
const N = MATRIX.length;
const QUIET = 2;
const MID = (N - 1) / 2;
/** Modules hidden behind the logo (9 × 9 of 29 × 29, ~10%: well inside H). */
const KNOCK = 4;
const FINDERS = [
  [0, 0],
  [N - 7, 0],
  [0, N - 7],
] as const;

const inFinder = (x: number, y: number) =>
  FINDERS.some(([fx, fy]) => x >= fx && x < fx + 7 && y >= fy && y < fy + 7);

interface Module {
  x: number;
  y: number;
  /** Distance from the centre, in modules: drives the ripple stagger. */
  d: number;
  /** Under the logo. */
  k: boolean;
}

const MODULES: Module[] = [];
for (let y = 0; y < N; y++) {
  for (let x = 0; x < N; x++) {
    if (MATRIX[y]?.[x] !== "1" || inFinder(x, y)) continue;
    MODULES.push({
      x,
      y,
      d: Math.round(Math.hypot(x - MID, y - MID) * 10) / 10,
      k: Math.abs(x - MID) <= KNOCK && Math.abs(y - MID) <= KNOCK,
    });
  }
}

/** The same code as one path, for the phone's viewfinder. */
const MINI_PATH = MATRIX.flatMap((row, y) =>
  Array.from(row).flatMap((bit, x) =>
    bit === "1" ? [`M${x} ${y}h1v1h-1z`] : [],
  ),
).join("");

type Shape = "square" | "dots" | "rounded";
type Tone = "mono" | "gradient" | "brand";

interface Stage {
  id: string;
  label: string;
  shape: Shape;
  eyes: Shape;
  tone: Tone;
  logo: boolean;
  frame: boolean;
  /** How long autoplay holds the stage, ms. */
  hold: number;
}

const STAGES: Stage[] = [
  {
    id: "classic",
    label: "Classic",
    shape: "square",
    eyes: "square",
    tone: "mono",
    logo: false,
    frame: false,
    hold: 2300,
  },
  {
    id: "dots",
    label: "Dots",
    shape: "dots",
    eyes: "dots",
    tone: "mono",
    logo: false,
    frame: false,
    hold: 2000,
  },
  {
    id: "rounded",
    label: "Rounded",
    shape: "rounded",
    eyes: "rounded",
    tone: "mono",
    logo: false,
    frame: false,
    hold: 2000,
  },
  {
    id: "gradient",
    label: "Gradient",
    shape: "rounded",
    eyes: "rounded",
    tone: "gradient",
    logo: false,
    frame: false,
    hold: 2100,
  },
  {
    id: "logo",
    label: "Logo",
    shape: "rounded",
    eyes: "rounded",
    tone: "brand",
    logo: true,
    frame: false,
    hold: 2100,
  },
  {
    id: "frame",
    label: "Frame",
    shape: "rounded",
    eyes: "rounded",
    tone: "brand",
    logo: true,
    frame: true,
    hold: 3700,
  },
];
const LAST = STAGES.length - 1;

/** Idle time after a click before autoplay resumes. */
const RESUME_MS = 6000;

type Phase = "idle" | "phone" | "scan" | "result" | "leave";

const CSS = `
.lq{--lq-e:cubic-bezier(.32,.72,0,1);--lq-pop:cubic-bezier(.34,1.56,.64,1)}
.lq .m{transform-box:fill-box;transform-origin:center;rx:0;ry:0;transform:scale(1.04);
  transition:transform 560ms var(--lq-e) calc(var(--d)*20ms),rx 560ms var(--lq-e) calc(var(--d)*20ms),ry 560ms var(--lq-e) calc(var(--d)*20ms)}
.lq[data-shape=dots] .m{transform:scale(.95);rx:.5;ry:.5}
.lq[data-shape=rounded] .m{transform:scale(1.01);rx:.3;ry:.3}
.lq[data-logo=true] .m.k{transform:scale(0)}
.lq[data-in=false] .m,.lq[data-pulse=true] .m{transform:scale(.0001)}
.lq[data-pulse=true] .m{transition-duration:300ms}
.lq .eo,.lq .ei{transform-box:fill-box;transform-origin:center;transition:rx 600ms var(--lq-e),ry 600ms var(--lq-e),transform 600ms var(--lq-e)}
.lq .eo{rx:0;ry:0}.lq .ei{rx:0;ry:0}
.lq[data-eyes=dots] .eo{rx:3;ry:3}.lq[data-eyes=dots] .ei{rx:1.5;ry:1.5}
.lq[data-eyes=rounded] .eo{rx:1.7;ry:1.7}.lq[data-eyes=rounded] .ei{rx:.75;ry:.75}
.lq[data-in=false] .eo,.lq[data-in=false] .ei{transform:scale(.0001)}
.lq .eo{transition-delay:120ms}.lq .ei{transition-delay:220ms}
.lq stop{transition:stop-color 800ms var(--lq-e)}
.lq .s1{stop-color:#0b0b0d}.lq .s2{stop-color:#0b0b0d}
.lq[data-tone=gradient] .s1{stop-color:#0b0b0d}.lq[data-tone=gradient] .s2{stop-color:#2f4fd6}
.lq[data-tone=brand] .s1{stop-color:#155dfc}.lq[data-tone=brand] .s2{stop-color:#0b3aa8}
.lq-scan{opacity:0}
[data-phase=scan] .lq-scan{animation:lq-scan 820ms cubic-bezier(.45,0,.2,1) both}
@keyframes lq-scan{0%{top:6%;opacity:0}12%{opacity:1}88%{opacity:1}100%{top:94%;opacity:0}}
@media (prefers-reduced-motion:reduce){.lq *,.lq-motion,.lq-motion *{transition:none!important;animation:none!important}}
`;

const STAGE_LABEL =
  "QR code for https://qrdx.dev that restyles itself: classic squares, dots, rounded modules, a gradient, the brand blue with the QRdx logo, and a Scan me frame";

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

/** Corner brackets of a camera viewfinder. */
function Viewfinder({ active }: { active: boolean }) {
  const corner = cn(
    "absolute size-3.5 border-current transition-colors duration-300",
    active ? "text-[#4d8dff]" : "text-white/80",
  );
  return (
    <div aria-hidden="true" className="absolute inset-[14%]">
      <span
        className={cn(
          corner,
          "top-0 left-0 rounded-tl-md border-t-2 border-l-2",
        )}
      />
      <span
        className={cn(
          corner,
          "top-0 right-0 rounded-tr-md border-t-2 border-r-2",
        )}
      />
      <span
        className={cn(
          corner,
          "bottom-0 left-0 rounded-bl-md border-b-2 border-l-2",
        )}
      />
      <span
        className={cn(
          corner,
          "right-0 bottom-0 rounded-br-md border-r-2 border-b-2",
        )}
      />
    </div>
  );
}

/** A phone drawn in CSS: camera view of the code, then the page it opens. */
function Phone({ phase }: { phase: Phase }) {
  const shown = phase === "phone" || phase === "scan" || phase === "result";
  const opened = phase === "result";
  return (
    <div
      aria-hidden="true"
      className={cn(
        "lq-motion absolute right-[3%] bottom-[2%] z-20 w-[92px] transition-[transform,opacity] duration-700 ease-[cubic-bezier(.32,.72,0,1)] sm:right-[6%] sm:bottom-[6%] sm:w-[128px] md:right-[12%] md:w-[140px]",
        shown
          ? "translate-x-0 rotate-[-8deg] opacity-100"
          : "translate-x-16 rotate-[4deg] opacity-0",
      )}
    >
      <div className="relative aspect-[9/19] rounded-[22px] bg-neutral-900 p-[5px] shadow-[0_24px_50px_-18px_rgba(0,0,0,0.55)] ring-1 ring-black/20 sm:rounded-[26px] dark:bg-neutral-800 dark:ring-white/15">
        <div className="relative size-full overflow-hidden rounded-[17px] bg-neutral-950 sm:rounded-[21px]">
          <span className="absolute top-[3%] left-1/2 z-10 h-[3.5%] w-[30%] -translate-x-1/2 rounded-full bg-black" />
          {/* Camera view */}
          <div
            className={cn(
              "absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_50%_40%,#2a2a2e,#0c0c0e)] transition-opacity duration-500",
              opened ? "opacity-0" : "opacity-100",
            )}
          >
            <div className="relative aspect-square w-[78%]">
              <div className="absolute inset-[16%] rotate-[3deg] rounded-[6px] bg-white p-[5%] shadow-lg">
                <svg
                  viewBox={`0 0 ${N} ${N}`}
                  className="size-full"
                  shapeRendering="crispEdges"
                >
                  <path d={MINI_PATH} fill="#0b0b0d" />
                </svg>
              </div>
              <Viewfinder active={phase === "scan"} />
            </div>
          </div>
          {/* The page the code opens */}
          <div
            className={cn(
              "absolute inset-0 flex flex-col gap-[6%] bg-white px-[9%] pt-[22%] text-neutral-900 transition-[opacity,transform] duration-500 ease-[cubic-bezier(.32,.72,0,1)]",
              opened ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
            )}
          >
            <div className="aspect-[16/10] rounded-[8px] bg-[linear-gradient(135deg,#e7e5e4,#d6d3d1)]" />
            <p className="text-[9px] font-semibold leading-tight sm:text-[11px]">
              Café Luna
            </p>
            <div className="flex flex-col gap-[7px]">
              {[0.8, 0.62, 0.72, 0.55].map((w) => (
                <div
                  key={w}
                  className="flex items-center justify-between gap-2"
                >
                  <span
                    className="h-[5px] rounded-full bg-neutral-200"
                    style={{ width: `${w * 70}%` }}
                  />
                  <span className="h-[5px] w-[14%] rounded-full bg-neutral-300" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Hero visual: a live QR code that styles itself in a ~14 s loop (modules
 * ripple in, the body and eyes reshape, colours move from ink to a gradient
 * to brand blue, the logo pops in, a frame slides in and a phone scans it).
 * The chips jump to a stage and pause autoplay, which resumes after a few
 * idle seconds. Static and fully styled with reduced motion; paused when the
 * hero is off screen or the tab is hidden.
 */
export function HeroLiveQr({ className }: { className?: string }) {
  const reduced = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [entered, setEntered] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [scans, setScans] = useState(1284);
  const [running, setRunning] = useState(false);
  const [auto, setAuto] = useState(true);
  const [held, setHeld] = useState(false);
  const resumeRef = useRef(0);

  const current = STAGES[index] ?? STAGES[0];

  // Reduced motion: start on the fully styled code, no intro.
  useEffect(() => {
    if (reduced) {
      setIndex(LAST);
      setEntered(true);
      setAuto(false);
    }
  }, [reduced]);

  // Run only while on screen and while the tab is visible.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    let onScreen = false;
    const update = () =>
      setRunning(onScreen && document.visibilityState === "visible");
    const io = new IntersectionObserver(
      ([entry]) => {
        onScreen = Boolean(entry?.isIntersecting);
        if (onScreen) setEntered(true);
        update();
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    document.addEventListener("visibilitychange", update);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  // Autoplay: advance through the stages.
  useEffect(() => {
    if (!running || !auto || held || reduced || !entered) return;
    const hold = current.hold + (index === 0 ? 500 : 0);
    const timers: number[] = [];
    timers.push(
      window.setTimeout(() => {
        const next = (index + 1) % STAGES.length;
        // Back to the start with a ripple through the code.
        if (next === 0) setPulse(true);
        setIndex(next);
      }, hold),
    );
    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
  }, [index, running, auto, held, reduced, entered, current.hold]);

  // The scan sequence plays whenever the frame stage is on screen.
  useEffect(() => {
    if (!current.frame || !running || reduced) {
      setPhase("idle");
      return;
    }
    const timers = [
      window.setTimeout(() => setPhase("phone"), 350),
      window.setTimeout(() => setPhase("scan"), 950),
      window.setTimeout(() => {
        setPhase("result");
        setScans((n) => n + 1);
      }, 1850),
      window.setTimeout(() => setPhase("leave"), 3250),
    ];
    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
  }, [current.frame, running, reduced]);

  // The restart ripple: shrink from the centre out, then grow back.
  useEffect(() => {
    if (!pulse) return;
    const t = window.setTimeout(() => setPulse(false), 520);
    return () => window.clearTimeout(t);
  }, [pulse]);

  useEffect(() => () => window.clearTimeout(resumeRef.current), []);

  // Tilt toward a mouse, coalesced into one write per frame.
  useEffect(() => {
    const root = rootRef.current;
    const tilt = tiltRef.current;
    if (!root || !tilt || reduced) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches)
      return;
    let raf = 0;
    let rx = 0;
    let ry = 0;
    const apply = () => {
      raf = 0;
      tilt.style.setProperty("--rx", `${rx.toFixed(2)}deg`);
      tilt.style.setProperty("--ry", `${ry.toFixed(2)}deg`);
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const r = tilt.getBoundingClientRect();
      const nx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      const ny = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      ry = Math.max(-1, Math.min(1, nx)) * 7;
      rx = Math.max(-1, Math.min(1, ny)) * -6;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const leave = () => {
      rx = 0;
      ry = 0;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    root.addEventListener("pointermove", move, { passive: true });
    root.addEventListener("pointerleave", leave, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerleave", leave);
    };
  }, [reduced]);

  const choose = (i: number) => {
    setIndex(i);
    setEntered(true);
    if (reduced) return;
    setAuto(false);
    window.clearTimeout(resumeRef.current);
    resumeRef.current = window.setTimeout(() => setAuto(true), RESUME_MS);
  };

  const toggleHeld = () => {
    window.clearTimeout(resumeRef.current);
    setHeld((value) => !value);
    setAuto(true);
  };

  const playing = !reduced && auto && !held;

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative flex flex-col items-center gap-6 md:gap-8",
        className,
      )}
    >
      <style>{CSS}</style>
      <div
        className="relative h-[400px] w-full sm:h-[470px] md:h-[520px]"
        data-phase={phase}
        style={{ perspective: "1200px" }}
      >
        <div
          ref={tiltRef}
          className="lq-motion absolute inset-0 transition-transform duration-700 ease-out [transform-style:preserve-3d]"
          style={
            {
              transform: "rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg))",
            } as CSSProperties
          }
        >
          {/* Paper, frame and code */}
          <div className="absolute top-[3%] left-1/2 w-[64%] max-w-[400px] -translate-x-1/2 sm:w-[50%] md:w-[42%]">
            <div
              aria-hidden="true"
              className={cn(
                "lq-motion absolute -inset-x-[6%] -top-[6%] -bottom-[19%] rounded-[30px] bg-[#155dfc] shadow-[0_30px_60px_-24px_rgba(21,93,252,0.55)] transition-[opacity,transform] duration-700 ease-[cubic-bezier(.32,.72,0,1)]",
                current.frame
                  ? "translate-y-0 scale-100 opacity-100"
                  : "translate-y-3 scale-[0.97] opacity-0",
              )}
            >
              <span
                className={cn(
                  "lq-motion absolute inset-x-0 bottom-[3.5%] text-center text-lg font-semibold tracking-tight text-white transition-[opacity,transform] delay-200 duration-500 ease-[cubic-bezier(.32,.72,0,1)] sm:text-xl",
                  current.frame
                    ? "translate-y-0 opacity-100"
                    : "translate-y-2 opacity-0",
                )}
              >
                Scan me
              </span>
            </div>
            <div
              role="img"
              aria-label={STAGE_LABEL}
              className="relative aspect-square rounded-[24px] bg-white p-[3%] shadow-[0_1px_2px_rgba(0,0,0,0.06),0_24px_48px_-20px_rgba(0,0,0,0.28)] ring-1 ring-black/5 dark:shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)]"
            >
              <svg
                viewBox={`${-QUIET} ${-QUIET} ${N + QUIET * 2} ${N + QUIET * 2}`}
                className="lq size-full"
                data-shape={current.shape}
                data-eyes={current.eyes}
                data-tone={current.tone}
                data-logo={current.logo}
                data-in={entered}
                data-pulse={pulse}
                aria-hidden="true"
              >
                <defs>
                  <linearGradient
                    id="lq-ink"
                    gradientUnits="userSpaceOnUse"
                    x1="0"
                    y1="0"
                    x2={N}
                    y2={N}
                  >
                    <stop className="s1" offset="0" />
                    <stop className="s2" offset="1" />
                  </linearGradient>
                </defs>
                <g fill="url(#lq-ink)">
                  {MODULES.map((m) => (
                    <rect
                      key={`${m.x}-${m.y}`}
                      className={m.k ? "m k" : "m"}
                      x={m.x}
                      y={m.y}
                      width={1}
                      height={1}
                      style={{ "--d": m.d } as CSSProperties}
                    />
                  ))}
                  {FINDERS.map(([fx, fy]) => (
                    <g key={`${fx}-${fy}`}>
                      <rect
                        className="eo"
                        x={fx + 0.5}
                        y={fy + 0.5}
                        width={6}
                        height={6}
                        fill="none"
                        stroke="url(#lq-ink)"
                        strokeWidth={1}
                      />
                      <rect
                        className="ei"
                        x={fx + 2}
                        y={fy + 2}
                        width={3}
                        height={3}
                      />
                    </g>
                  ))}
                </g>
              </svg>
              {/* Logo */}
              <div
                aria-hidden="true"
                className={cn(
                  "lq-motion absolute top-1/2 left-1/2 grid aspect-square w-[22%] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[22%] bg-white p-[3.5%] shadow-[0_2px_8px_rgba(0,0,0,0.12)] transition-[transform,opacity] ease-[cubic-bezier(.34,1.56,.64,1)]",
                  current.logo
                    ? "scale-100 opacity-100 delay-300 duration-500"
                    : "scale-0 opacity-0 duration-300",
                )}
              >
                <QrdxLogo className="text-[#155dfc]" />
              </div>
              {/* Scan line */}
              <span
                aria-hidden="true"
                className="lq-scan pointer-events-none absolute inset-x-[4%] h-[2px] rounded-full bg-[#4d8dff] shadow-[0_0_18px_4px_rgba(77,141,255,0.55)]"
              />
            </div>
          </div>

          {/* Scans today */}
          <div
            aria-hidden="true"
            className="lq-motion absolute top-[2%] left-[2%] flex items-center gap-3 rounded-2xl border bg-background/85 px-3.5 py-2.5 shadow-sm backdrop-blur sm:top-[34%] sm:left-[4%] md:left-[10%]"
          >
            <span className="relative flex size-2">
              <span
                key={scans}
                className="lq-motion absolute inset-0 animate-ping rounded-full bg-emerald-500/60 [animation-iteration-count:1]"
              />
              <span className="relative size-2 rounded-full bg-emerald-500" />
            </span>
            <div className="flex flex-col">
              <span className="text-[11px] leading-none text-muted-foreground">
                Scans today
              </span>
              <span className="relative mt-1 h-5 overflow-hidden text-sm font-semibold tabular-nums leading-5">
                <span
                  key={scans}
                  className="lq-motion block animate-in slide-in-from-bottom-3 fade-in duration-500"
                >
                  {scans.toLocaleString("en-US")}
                </span>
              </span>
            </div>
          </div>

          {/* Result card */}
          <div
            aria-hidden="true"
            className={cn(
              "lq-motion absolute right-[2%] bottom-[30%] z-30 flex items-center gap-2.5 rounded-2xl border bg-popover px-3 py-2 text-popover-foreground shadow-lg transition-[opacity,transform] duration-500 ease-[cubic-bezier(.34,1.56,.64,1)] sm:right-[4%] sm:bottom-[52%] md:right-[8%]",
              phase === "result"
                ? "translate-y-0 scale-100 opacity-100"
                : "translate-y-2 scale-95 opacity-0",
            )}
          >
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <Tick className="size-3.5" />
            </span>
            <div className="flex flex-col">
              <span className="text-xs font-medium leading-tight">
                Menu opened
              </span>
              <span className="font-mono text-[10px] text-muted-foreground leading-tight">
                qrdx.dev/p/cafe-luna
              </span>
            </div>
          </div>

          <Phone phase={phase} />
        </div>
      </div>

      {/* biome-ignore lint/a11y/useSemanticElements: a row of toggle buttons, not a form fieldset */}
      <div
        role="group"
        aria-label="QR code styles"
        className="flex max-w-full flex-wrap items-center justify-center gap-1.5 px-4"
      >
        {STAGES.map((s, i) => {
          const active = i === index;
          return (
            <Button
              key={s.id}
              type="button"
              variant={active ? "secondary" : "ghost"}
              aria-pressed={active}
              onClick={() => choose(i)}
              className={cn("relative", !active && "text-muted-foreground")}
            >
              {s.label}
              {active && playing && running && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-4 bottom-1 h-px overflow-hidden rounded-full bg-foreground/10"
                >
                  <span
                    key={`${index}-${scans}`}
                    className="lq-motion block h-full origin-left bg-foreground/50"
                    style={{
                      animation: `lq-progress ${s.hold + (i === 0 ? 500 : 0)}ms linear both`,
                    }}
                  />
                </span>
              )}
            </Button>
          );
        })}
        {!reduced && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={toggleHeld}
            aria-label={held ? "Play the animation" : "Pause the animation"}
            className="text-muted-foreground"
          >
            {held ? (
              <Play variant="Bold" className="size-4" />
            ) : (
              <Pause variant="Bold" className="size-4" />
            )}
          </Button>
        )}
      </div>
      <style>
        {
          "@keyframes lq-progress{from{transform:scaleX(0)}to{transform:scaleX(1)}}"
        }
      </style>
    </div>
  );
}
