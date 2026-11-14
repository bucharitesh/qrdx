"use client";

import { cn } from "@repo/design-system/lib/utils";
import { Pause, Play } from "iconsax-reactjs";
import {
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { EASE_CLASS } from "@/components/mockups/motion";
import { countUpText } from "@/lib/home-numbers/format";
import type { HomeNumber } from "@/lib/home-numbers/stats";

// Behaviour only: every word and number shown comes in as props from the
// server (numbers-section.tsx), so this module carries none of them.
//
// - The rows are tabs (roving tabindex, arrow keys, Home/End); the big
//   number on the right is their tab panel.
// - The active row cycles every few seconds while the section is on screen,
//   pausing while the pointer or focus is on the rows. Picking a row, or the
//   pause button, stops it.
// - The numbers count up the first time the section scrolls into view.
// - prefers-reduced-motion: no cycling, no count-up, no transitions.
// - Screen readers get each final value (sr-only); the animated digits are
//   aria-hidden. An invisible copy of the final text holds the width, so
//   counting never moves anything.

/** How long each number stays active while cycling (ms). */
const CYCLE_MS = 4500;
/** Count-up length (ms). */
const COUNT_UP_MS = 1400;

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

function Count({
  item,
  progress,
  className,
  digitsClassName,
}: {
  item: HomeNumber;
  progress: number;
  className?: string;
  digitsClassName?: string;
}) {
  // --chars lets the big number size itself to fit ("46" vs "4.32M+").
  return (
    <span
      className={cn("grid tabular-nums", className)}
      style={{ "--chars": item.count.text.length } as CSSProperties}
    >
      <span className="sr-only">{item.count.spoken}</span>
      <span aria-hidden="true" className="invisible col-start-1 row-start-1">
        {item.count.text}
      </span>
      <span
        aria-hidden="true"
        className={cn("col-start-1 row-start-1", digitsClassName)}
      >
        {countUpText(item.count, progress)}
      </span>
    </span>
  );
}

interface NumbersTabsProps {
  items: readonly HomeNumber[];
  /** Heading and description, rendered on the server. */
  intro: ReactNode;
  /** Id of the heading that names the tab list. */
  labelledBy: string;
}

export function NumbersTabs({ items, intro, labelledBy }: NumbersTabsProps) {
  const baseId = useId();
  const tabId = (index: number) => `${baseId}-tab-${index}`;
  const panelId = `${baseId}-panel`;
  const rootRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const [active, setActive] = useState(0);
  /** Count-up progress; 1 (final values) on the server and without motion. */
  const [progress, setProgress] = useState(1);
  /** False until the browser says motion is fine. */
  const [motionOk, setMotionOk] = useState(false);
  const [inView, setInView] = useState(false);
  /** Stopped by the pause button or by picking a row. */
  const [stopped, setStopped] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setMotionOk(!query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    // Count up only when the section starts below the fold: numbers already
    // on screen at hydration stay as they are.
    let countPending =
      !reduce && root.getBoundingClientRect().top >= window.innerHeight;
    if (countPending) setProgress(0);
    let frame = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const visible = Boolean(entry?.isIntersecting);
        setInView(visible);
        if (!(visible && countPending)) return;
        countPending = false;
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / COUNT_UP_MS);
          setProgress(t >= 1 ? 1 : easeOutCubic(t));
          if (t < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.25 },
    );
    observer.observe(root);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  const canCycle = motionOk && items.length > 1;
  const cycling =
    canCycle &&
    !stopped &&
    !hovering &&
    !focusWithin &&
    inView &&
    progress >= 1;

  useEffect(() => {
    if (!cycling) return;
    const timer = setInterval(
      () => setActive((index) => (index + 1) % items.length),
      CYCLE_MS,
    );
    return () => clearInterval(timer);
  }, [cycling, items.length]);

  const pick = (index: number) => {
    setActive(index);
    setStopped(true);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = items.length - 1;
    const targets: Record<string, number> = {
      ArrowDown: active === last ? 0 : active + 1,
      ArrowRight: active === last ? 0 : active + 1,
      ArrowUp: active === 0 ? last : active - 1,
      ArrowLeft: active === 0 ? last : active - 1,
      Home: 0,
      End: last,
    };
    if (!Object.hasOwn(targets, event.key)) return;
    const next = targets[event.key] ?? 0;
    event.preventDefault();
    pick(next);
    tabRefs.current[next]?.focus();
  };

  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setFocusWithin(false);
    }
  };

  const mouseOnly =
    (handler: () => void) => (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType === "mouse") handler();
    };

  const slider = {
    "--count": items.length,
    "--active": active,
  } as CSSProperties;

  return (
    <div ref={rootRef} className="grid @3xl/numbers:grid-cols-2">
      <div className="flex flex-col gap-8 py-8 pl-6 @3xl/numbers:gap-10 @3xl/numbers:py-10 @3xl/numbers:pl-10">
        {intro}
        <div
          role="tablist"
          aria-orientation="vertical"
          aria-labelledby={labelledBy}
          onKeyDown={onKeyDown}
          onFocus={() => setFocusWithin(true)}
          onBlur={onBlur}
          onPointerEnter={mouseOnly(() => setHovering(true))}
          onPointerLeave={mouseOnly(() => setHovering(false))}
          style={slider}
          className="relative grid auto-rows-fr"
        >
          {/* The connector: rides the column line beside the active row. */}
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute top-0 -right-px z-10 hidden w-px bg-primary @3xl/numbers:block",
              "h-[calc(100%/var(--count))] translate-y-[calc(var(--active)*100%)]",
              "transition-transform duration-500 motion-reduce:transition-none",
              EASE_CLASS,
            )}
          >
            <span className="absolute top-0 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-4 ring-background" />
            <span className="absolute bottom-0 left-1/2 size-2 -translate-x-1/2 translate-y-1/2 rounded-full bg-primary ring-4 ring-background" />
          </span>
          {items.map((item, index) => {
            const selected = index === active;
            return (
              <button
                key={item.id}
                ref={(node) => {
                  tabRefs.current[index] = node;
                }}
                id={tabId(index)}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={panelId}
                tabIndex={selected ? 0 : -1}
                onClick={() => pick(index)}
                onFocus={() => setActive(index)}
                onPointerEnter={mouseOnly(() => setActive(index))}
                className={cn(
                  "my-1 mr-6 flex flex-col items-start gap-1.5 rounded-xl px-4 py-3 text-left @3xl/numbers:mr-8",
                  "transition-[background-color,box-shadow,opacity] duration-300 motion-reduce:transition-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  EASE_CLASS,
                  selected
                    ? "bg-card opacity-100 shadow-sm ring-1 ring-border"
                    : "opacity-50 hover:opacity-80",
                )}
              >
                <span className="font-mono text-[11px] leading-none tracking-wider text-muted-foreground uppercase">
                  {item.label}
                </span>
                <Count
                  item={item}
                  progress={progress}
                  className="text-3xl font-medium tracking-tight @3xl/numbers:text-4xl"
                />
              </button>
            );
          })}
        </div>
      </div>

      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={tabId(active)}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a tab panel with nothing focusable inside takes focus itself (WAI-ARIA tabs pattern)
        tabIndex={0}
        // A size container: the big number scales with the panel, not the
        // viewport, so it fits wherever the section is placed.
        className="@container relative grid min-h-72 items-end overflow-hidden border-t px-6 pt-12 pb-8 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring @3xl/numbers:min-h-0 @3xl/numbers:border-t-0 @3xl/numbers:border-l @3xl/numbers:px-10 @3xl/numbers:pb-10"
      >
        {items.map((item, index) => (
          <div
            key={item.id}
            aria-hidden={index !== active}
            className={cn(
              "col-start-1 row-start-1 flex min-w-0 flex-col transition-opacity duration-500 motion-reduce:transition-none",
              EASE_CLASS,
              index === active ? "opacity-100" : "opacity-0",
            )}
          >
            <Count
              item={item}
              progress={progress}
              // At most 10rem, and narrow enough for its own characters
              // (about 0.6em each) to fit the panel's width.
              className="text-[length:clamp(2.5rem,calc(100cqw/(var(--chars)*0.62)),10rem)] leading-[0.9] font-medium tracking-tighter"
              digitsClassName="bg-linear-to-b from-foreground/30 via-foreground/12 to-foreground/0 bg-clip-text text-transparent"
            />
            <p className="relative -mt-[min(9cqw,3rem)] text-2xl font-normal tracking-tight text-balance text-foreground @3xl/numbers:text-3xl">
              {item.label}
            </p>
            {item.since && (
              <p className="mt-3 font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
                {item.since}
              </p>
            )}
          </div>
        ))}
        {canCycle && (
          <button
            type="button"
            onClick={() => setStopped((value) => !value)}
            aria-label={
              stopped ? "Play the numbers again" : "Pause the numbers"
            }
            className="absolute top-4 right-4 grid size-8 place-items-center rounded-full border bg-background text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {stopped ? (
              <Play className="size-3.5" />
            ) : (
              <Pause className="size-3.5" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}
