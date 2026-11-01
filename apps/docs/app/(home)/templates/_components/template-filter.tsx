"use client";

import { cn } from "@repo/design-system/lib/utils";
import { type ReactNode, useEffect, useRef, useState } from "react";

export interface TemplateFilterType {
  type: string;
  label: string;
  count: number;
}

const ALL = "all";
const TYPE_PATTERN = /^[a-z][a-z0-9-]{0,47}$/;

/**
 * Chips that narrow the gallery to one page type. The sections are rendered
 * on the server (children with data-template-section="<type>"); this only
 * hides the others with one CSS rule, so filtering re-renders nothing. The
 * choice lives in the URL hash (#menu), which is also each section's anchor,
 * so /templates#menu links keep working.
 */
export function TemplateFilter({
  types,
  total,
  children,
}: {
  types: TemplateFilterType[];
  total: number;
  children: ReactNode;
}) {
  const [active, setActive] = useState(ALL);
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fromHash = () => {
      const hash = decodeURIComponent(window.location.hash.slice(1));
      setActive(types.some((item) => item.type === hash) ? hash : ALL);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [types]);

  const select = (next: string) => {
    setActive(next);
    const url = next === ALL ? window.location.pathname : `#${next}`;
    window.history.replaceState(null, "", url);
    const top = topRef.current;
    if (top && top.getBoundingClientRect().top < 0) {
      top.scrollIntoView({ block: "start" });
    }
  };

  const chips = [{ type: ALL, label: "All", count: total }, ...types];

  return (
    <div className="flex w-full flex-col" ref={topRef}>
      {active !== ALL && TYPE_PATTERN.test(active) && (
        <style>{`[data-template-section]:not([data-template-section="${active}"]){display:none}`}</style>
      )}
      <div className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur supports-backdrop-filter:bg-background/70">
        <div
          aria-label="Page types"
          className="flex scroll-px-6 snap-x gap-1.5 overflow-x-auto px-6 py-3 [mask-image:linear-gradient(to_right,transparent,black_20px,black_calc(100%-20px),transparent)] [scrollbar-width:none] md:flex-wrap md:justify-center md:px-10 md:[mask-image:none]"
          role="toolbar"
        >
          {chips.map((chip) => {
            const selected = active === chip.type;
            return (
              <button
                aria-pressed={selected}
                className={cn(
                  "inline-flex h-8 shrink-0 snap-start items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                  selected
                    ? "border-foreground bg-foreground text-background"
                    : "bg-background text-muted-foreground hover:border-foreground/25 hover:text-foreground",
                )}
                key={chip.type}
                onClick={() => select(chip.type)}
                type="button"
              >
                {chip.label}
                <span
                  className={cn(
                    "text-[11px] tabular-nums",
                    selected
                      ? "text-background/70"
                      : "text-muted-foreground/80",
                  )}
                >
                  {chip.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <p aria-live="polite" className="sr-only">
        {active === ALL
          ? `Showing all ${total} templates`
          : `Showing ${types.find((item) => item.type === active)?.label} templates`}
      </p>
      {children}
    </div>
  );
}
