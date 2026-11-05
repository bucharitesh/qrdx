"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import { Input } from "@repo/design-system/components/ui/input";
import { cn } from "@repo/design-system/lib/utils";
import {
  ArrowDown2,
  ArrowSwapHorizontal,
  RotateRight,
  Trash,
} from "iconsax-reactjs";
import type { GradientStop } from "qrdx/types";
import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { clamp, round } from "@/lib/paint/color-math";
import {
  addStop,
  MIN_STOPS,
  moveStop,
  normalizeStops,
  removeStop,
  reverseStops,
  rotateAngle,
} from "@/lib/paint/gradient-stops";
import { CHECKER_STYLE } from "./controls";

/** CSS for the bar: the stops left to right, whatever the gradient's kind. */
function barBackground(stops: GradientStop[]) {
  const list = normalizeStops(stops)
    .map((stop) => `${stop.color} ${stop.offset}%`)
    .join(", ");
  return `linear-gradient(to right, ${list})`;
}

/**
 * The gradient's stops on a bar. Click the bar to add a stop there (colored
 * as the gradient is), drag a stop to move it, arrow keys move the focused
 * stop 1% (10% with Shift), Delete or Backspace removes it (two stay).
 */
export function GradientBar({
  stops,
  selected,
  onSelect,
  onChange,
}: {
  stops: GradientStop[];
  selected: number;
  onSelect: (index: number) => void;
  onChange: (stops: GradientStop[], selected: number) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const handleRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [dragging, setDragging] = useState<number | null>(null);
  // Key repeats can land before the next render: edit the latest stops
  const latest = useRef(stops);
  latest.current = stops;
  const send = (next: GradientStop[], index: number) => {
    latest.current = next;
    onChange(next, index);
  };

  const offsetAt = (clientX: number) => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return clamp(
      ((clientX - rect.left) / Math.max(rect.width, 1)) * 100,
      0,
      100,
    );
  };

  // Keep focus on the selected stop after it's added or removed
  const focusNext = useRef<number | null>(null);
  useEffect(() => {
    if (focusNext.current === null) return;
    handleRefs.current[focusNext.current]?.focus();
    focusNext.current = null;
  });

  const onBarPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("[data-stop]")) return;
    const added = addStop(latest.current, offsetAt(event.clientX));
    if (!added) return;
    focusNext.current = added.index;
    send(added.stops, added.index);
  };

  const onHandleKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const current = latest.current;
    const stop = current[index];
    if (!stop) return;
    const step = event.shiftKey ? 10 : 1;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      send(moveStop(current, index, stop.offset - step), index);
    } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      send(moveStop(current, index, stop.offset + step), index);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      send(moveStop(current, index, event.key === "Home" ? 0 : 100), index);
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      const removed = removeStop(current, index);
      if (removed) {
        focusNext.current = removed.index;
        send(removed.stops, removed.index);
      }
    }
  };

  return (
    <div className="relative px-2 pt-1 pb-4">
      <div
        aria-hidden="true"
        className="relative h-6 cursor-copy rounded-md"
        onPointerDown={onBarPointerDown}
        ref={barRef}
        style={CHECKER_STYLE}
        title="Click to add a stop"
      >
        <span
          className="absolute inset-0 rounded-md shadow-[inset_0_0_0_1px_rgb(0_0_0/0.1)]"
          style={{ background: barBackground(stops) }}
        />
      </div>
      {stops.map((stop, index) => (
        <button
          aria-label={`Stop ${index + 1}, ${stop.color}`}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={round(stop.offset)}
          aria-valuetext={`${round(stop.offset)}%`}
          className={cn(
            "focus-visible:ring-ring/50 absolute bottom-0 flex size-5 -translate-x-1/2 touch-none items-center justify-center rounded-full bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.25),0_1px_2px_rgb(0_0_0/0.25)] outline-none focus-visible:ring-[3px]",
            index === selected &&
              "ring-foreground ring-2 ring-offset-1 ring-offset-background",
            dragging === index ? "cursor-grabbing" : "cursor-grab",
          )}
          data-stop=""
          key={index}
          onClick={() => onSelect(index)}
          onKeyDown={(event) => onHandleKeyDown(event, index)}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setDragging(index);
            onSelect(index);
          }}
          onPointerMove={(event) => {
            if (dragging !== index) return;
            send(
              moveStop(latest.current, index, offsetAt(event.clientX)),
              index,
            );
          }}
          onPointerUp={() => setDragging(null)}
          ref={(element) => {
            handleRefs.current[index] = element;
          }}
          role="slider"
          // The bar sits 8px in from each side of this box
          style={{ left: `calc(8px + (100% - 16px) * ${stop.offset / 100})` }}
          type="button"
        >
          <span className="size-3.5 rounded-full" style={{ ...CHECKER_STYLE }}>
            <span
              className="block size-full rounded-full"
              style={{ background: stop.color }}
            />
          </span>
        </button>
      ))}
    </div>
  );
}

const ANGLE_PRESETS = [0, 45, 90, 135, 180, 225, 270, 315];

/**
 * A small dial for an angle: drag around it, or arrow keys (1°, 15° with
 * Shift). The line points the way the gradient runs.
 */
function AngleDial({
  angle,
  onChange,
  label,
  fromTop,
}: {
  angle: number;
  onChange: (angle: number) => void;
  label: string;
  /** 0° points up (angular) instead of right (linear) */
  fromTop: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef(angle);
  latest.current = angle;
  const send = (next: number) => {
    latest.current = next;
    onChange(next);
  };
  const update = (event: PointerEvent<HTMLDivElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const x = event.clientX - (rect.left + rect.width / 2);
    const y = event.clientY - (rect.top + rect.height / 2);
    let degrees = (Math.atan2(y, x) * 180) / Math.PI + (fromTop ? 90 : 0);
    if (event.shiftKey) degrees = Math.round(degrees / 15) * 15;
    send(rotateAngle(degrees, 0));
  };
  const visual = angle - (fromTop ? 90 : 0);
  return (
    <div
      aria-label={label}
      aria-valuemax={359}
      aria-valuemin={0}
      aria-valuenow={angle}
      aria-valuetext={`${angle}°`}
      className="focus-visible:ring-ring/50 border-input relative size-8 shrink-0 cursor-pointer touch-none rounded-full border outline-none focus-visible:ring-[3px]"
      onKeyDown={(event) => {
        const step = event.shiftKey ? 15 : 1;
        if (event.key === "ArrowRight" || event.key === "ArrowUp") {
          event.preventDefault();
          send(rotateAngle(latest.current, step));
        } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
          event.preventDefault();
          send(rotateAngle(latest.current, -step));
        }
      }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.focus();
        update(event);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          update(event);
        }
      }}
      ref={ref}
      role="slider"
      tabIndex={0}
    >
      <span
        aria-hidden="true"
        className="bg-foreground absolute top-1/2 left-1/2 h-px w-3 origin-left"
        style={{ transform: `rotate(${visual}deg)` }}
      />
      <span
        aria-hidden="true"
        className="bg-foreground absolute top-1/2 left-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full"
      />
    </div>
  );
}

/**
 * The row under the bar: the angle (dial, degrees and presets) for linear
 * and angular gradients, then reverse, rotate 90° and remove the stop.
 */
export function GradientToolbar({
  angle,
  onAngle,
  hasAngle,
  fromTop,
  onReverse,
  onRemove,
  canRemove,
}: {
  angle: number;
  onAngle: (angle: number) => void;
  hasAngle: boolean;
  fromTop: boolean;
  onReverse: () => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const [draft, setDraft] = useState(String(angle));
  useEffect(() => setDraft(String(angle)), [angle]);
  const commit = () => {
    const value = Number.parseFloat(draft);
    if (Number.isFinite(value)) onAngle(rotateAngle(value, 0));
    else setDraft(String(angle));
  };
  return (
    <div className="flex items-center gap-1.5">
      {hasAngle && (
        <>
          <AngleDial
            angle={angle}
            fromTop={fromTop}
            label={fromTop ? "Start angle" : "Angle"}
            onChange={onAngle}
          />
          <div className="relative w-16">
            <Input
              aria-label={
                fromTop ? "Start angle in degrees" : "Angle in degrees"
              }
              className="h-8 pr-5 text-xs tabular-nums"
              inputMode="decimal"
              onBlur={commit}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") commit();
                if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                  event.preventDefault();
                  const step =
                    (event.shiftKey ? 15 : 1) *
                    (event.key === "ArrowUp" ? 1 : -1);
                  onAngle(rotateAngle(angle, step));
                }
              }}
              value={draft}
            />
            <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs">
              °
            </span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label="Angle presets"
                className="size-8"
                size="icon"
                type="button"
                variant="ghost"
              >
                <ArrowDown2 className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            {/* Above the picker (z-[130]) */}
            <DropdownMenuContent align="start" className="z-[140] min-w-24">
              {ANGLE_PRESETS.map((preset) => (
                <DropdownMenuItem
                  className="text-xs tabular-nums"
                  key={preset}
                  onSelect={() => onAngle(preset)}
                >
                  <span
                    aria-hidden="true"
                    className="inline-block w-3 text-center"
                    style={{
                      transform: `rotate(${preset - (fromTop ? 90 : 0)}deg)`,
                    }}
                  >
                    →
                  </span>
                  {preset}°
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            aria-label="Rotate 90°"
            className="size-8"
            onClick={() => onAngle(rotateAngle(angle, 90))}
            size="icon"
            title="Rotate 90°"
            type="button"
            variant="ghost"
          >
            <RotateRight className="size-4" />
          </Button>
        </>
      )}
      <Button
        aria-label="Reverse the gradient"
        className="size-8"
        onClick={onReverse}
        size="icon"
        title="Reverse"
        type="button"
        variant="ghost"
      >
        <ArrowSwapHorizontal className="size-4" />
      </Button>
      <Button
        aria-label="Remove the selected stop"
        className="ml-auto size-8"
        disabled={!canRemove}
        onClick={onRemove}
        size="icon"
        title={
          canRemove
            ? "Remove stop (Delete)"
            : `A gradient keeps ${MIN_STOPS} stops`
        }
        type="button"
        variant="ghost"
      >
        <Trash className="size-4" />
      </Button>
    </div>
  );
}

export { reverseStops };
