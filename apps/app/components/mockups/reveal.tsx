"use client";

import { cn } from "@repo/design-system/lib/utils";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { EASE_CLASS } from "./motion";

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Milliseconds, for staggering siblings. */
  delay?: number;
}

/**
 * Fades and lifts content in the first time it scrolls into view. Server HTML
 * and anything already on screen at hydration stay visible (no flash, works
 * without JS); only content below the fold is hidden until it is reached.
 * Skipped entirely with prefers-reduced-motion.
 */
export function Reveal({ children, className, delay = 0 }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"static" | "hidden" | "shown">("static");

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;

    setState("hidden");
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setState("shown");
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-reveal={state}
      style={state === "shown" ? { transitionDelay: `${delay}ms` } : undefined}
      className={cn(
        "transition-[opacity,transform] duration-300",
        EASE_CLASS,
        state === "hidden" && "translate-y-3 opacity-0 duration-0",
        className,
      )}
    >
      {children}
    </div>
  );
}
