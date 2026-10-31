"use client";

import { cn } from "@repo/design-system/lib/utils";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { type KeyboardEvent, useId } from "react";
import { LAYOUT_TRANSITION } from "./motion";

interface SegmentedControlProps<T extends string> {
  /** Accessible name of the group. */
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  size?: "sm" | "md";
}

/** Pill-style single choice (radio semantics) with a sliding indicator. */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
  size = "md",
}: SegmentedControlProps<T>) {
  const id = useId();
  const reduce = useReducedMotion();

  // Arrow keys move the selection, as in a native radio group.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (!step) return;
    event.preventDefault();
    const index = options.findIndex((option) => option.value === value);
    const next = options[(index + step + options.length) % options.length];
    if (!next) return;
    onChange(next.value);
    const buttons =
      event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=radio]");
    buttons[options.indexOf(next)]?.focus();
  };

  return (
    <LayoutGroup id={id}>
      <div
        role="radiogroup"
        aria-label={label}
        onKeyDown={onKeyDown}
        className={cn(
          "inline-flex flex-wrap gap-1 rounded-[1.1rem] border border-border bg-muted/60 p-1",
          className,
        )}
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            // biome-ignore lint/a11y/useSemanticElements: styled pill radios; role and aria-checked keep radio semantics
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(option.value)}
              className={cn(
                "relative rounded-full font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                size === "sm"
                  ? "h-7 px-2.5 text-xs"
                  : "h-8 px-2.5 text-sm sm:px-3",
                selected
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {selected && (
                <motion.span
                  layoutId="pill"
                  transition={reduce ? { duration: 0 } : LAYOUT_TRANSITION}
                  className="absolute inset-0 rounded-full border border-border bg-background shadow-sm"
                />
              )}
              <span className="relative">{option.label}</span>
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}
