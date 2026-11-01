"use client";

import { GithubLogo } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/design-system/components/ui/tooltip";
import { cn } from "@repo/design-system/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useLayoutEffect, useState } from "react";
import { siteConfig } from "@/config/site";
import { formatCompactNumber } from "@/utils/format";
import styles from "./github-stars.module.css";

/** From our cached route (app/api/github-stars), not GitHub directly. */
function useStars() {
  return useQuery({
    queryKey: ["github-stars"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/github-stars");
        if (!res.ok) return 0;
        const data: { stars: number | null } = await res.json();
        return data.stars ?? 0;
      } catch {
        return 0;
      }
    },
    staleTime: 3_600_000,
  });
}

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

/** One odometer wheel that rolls from 0 to `digit` (no roll with reduced motion). */
function Wheel({
  digit,
  index,
  rolled,
}: {
  digit: number;
  index: number;
  rolled: boolean;
}) {
  return (
    <span className="relative inline-block h-[1lh] w-[1ch] overflow-hidden">
      <span
        className="absolute inset-x-0 top-0 flex flex-col transition-transform duration-600 ease-[cubic-bezier(.32,.72,0,1)] motion-reduce:transition-none"
        style={{
          transform: `translateY(${rolled ? -digit : 0}lh)`,
          transitionDelay: `${index * 70}ms`,
        }}
      >
        {DIGITS.map((d) => (
          <span key={d} className="h-[1lh] text-center">
            {d}
          </span>
        ))}
      </span>
    </span>
  );
}

/** "1.2k" with each digit rolling up on first show. */
function Odometer({ value }: { value: string }) {
  const [rolled, setRolled] = useState(false);
  // Only ever rendered on the client (the count is fetched after mount).
  // Reduced motion: show the digits before the first paint, no roll.
  useLayoutEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setRolled(true);
      return;
    }
    const id = requestAnimationFrame(() => setRolled(true));
    return () => cancelAnimationFrame(id);
  }, []);

  let wheel = 0;
  return (
    <span aria-hidden className="inline-flex tabular-nums">
      {value.split("").map((char, i) => {
        const digit = Number.parseInt(char, 10);
        if (Number.isNaN(digit)) {
          return <span key={i}>{char}</span>;
        }
        const index = wheel++;
        return <Wheel key={i} digit={digit} index={index} rolled={rolled} />;
      })}
    </span>
  );
}

/**
 * GitHub pill for the site headers: the GitHub mark plus the live star count
 * (rolls up on load) and a light sweep now and then. Icon-only below `sm`.
 * Reduced motion: no roll, no sweep.
 */
export function GithubStars({
  className,
  full = false,
}: {
  className?: string;
  /** Show the count at every width (default: icon-only below `sm`). */
  full?: boolean;
}) {
  const { data: stars = 0, isPending } = useStars();
  const label = stars > 0 ? formatCompactNumber(stars) : null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          asChild
          variant="outline"
          size="sm"
          className={cn(
            "relative gap-1.5 overflow-hidden transition-[box-shadow,background-color,color] duration-300 hover:shadow-[0_0_0_4px_color-mix(in_oklab,var(--foreground)_6%,transparent)]",
            !full && "max-sm:px-2",
            className,
          )}
        >
          <a
            href={siteConfig.links.github}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={
              label
                ? `Star QRdx on GitHub (${label} stars)`
                : "Star QRdx on GitHub"
            }
          >
            {/* The sweep is CSS only (github-stars.module.css): none with reduced motion. */}
            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-foreground/10 to-transparent motion-reduce:hidden",
                styles.sweep,
              )}
            />
            <GithubLogo aria-hidden className="size-4 shrink-0" />
            <span
              className={cn(
                "min-w-[3ch] items-center justify-center text-sm font-semibold",
                full ? "inline-flex" : "hidden sm:inline-flex",
              )}
            >
              {isPending ? (
                <span
                  aria-hidden
                  className="h-3.5 w-[3ch] animate-pulse rounded-full bg-muted-foreground/20"
                />
              ) : label ? (
                <Odometer value={label} />
              ) : (
                <span aria-hidden>Star</span>
              )}
            </span>
          </a>
        </Button>
      </TooltipTrigger>
      <TooltipContent>Star QRdx on GitHub</TooltipContent>
    </Tooltip>
  );
}
