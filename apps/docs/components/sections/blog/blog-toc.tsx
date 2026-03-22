"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { cn } from "@repo/design-system/lib/utils";

interface TocItem {
  title: ReactNode;
  url: string;
  depth: number;
}

export function BlogToc({ items }: { items: TocItem[] }) {
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    const ids = items.map((item) => item.url.slice(1));

    const onScroll = () => {
      let current = ids[0] ?? "";
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top < 128) {
          current = id;
        }
      }
      setActiveId(current);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [items]);

  return (
    <div>
      {/* Header */}
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border px-5 py-5">
        On this page
      </p>

      {/* TOC nav */}
      <nav className="relative py-4" aria-label="Table of contents">
        {/* Vertical track line */}
        <div className="absolute left-5 top-4 bottom-4 w-px bg-border" />

        <ul className="flex flex-col gap-0.5">
          {items.map((item) => {
            const id = item.url.slice(1);
            const isActive = activeId === id;
            const nestPad = (item.depth - 2) * 10;

            return (
              <li key={item.url}>
                <a
                  href={item.url}
                  onClick={() => setActiveId(id)}
                  className={cn(
                    "group relative flex items-center py-1 pr-5 leading-snug transition-colors duration-200",
                    item.depth > 2 ? "text-xs" : "text-sm",
                    isActive
                      ? "text-foreground font-medium"
                      : "text-muted-foreground hover:text-secondary-foreground",
                  )}
                  style={{ paddingLeft: `${36 + nestPad}px` }}
                >
                  {/* Animated pill indicator on track */}
                  <span
                    className={cn(
                      "absolute left-5 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-all duration-300 ease-out",
                      isActive
                        ? "h-5 w-[3px] bg-primary"
                        : "h-1 w-1 bg-border group-hover:h-2.5 group-hover:w-[3px] group-hover:bg-muted-foreground/60",
                    )}
                  />

                  {item.title}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
