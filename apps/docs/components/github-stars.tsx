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
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { EASE } from "@/components/mockups/motion";
import { siteConfig } from "@/config/site";
import { useMounted } from "@/lib/hooks/use-mounted";
import { formatCompactNumber } from "@/utils/format";

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

/** One odometer wheel that rolls from 0 to `digit`. */
function Wheel({
  digit,
  index,
  rolled,
  reduce,
}: {
  digit: number;
  index: number;
  rolled: boolean;
  reduce: boolean;
}) {
  return (
    <span className="relative inline-block h-[1lh] w-[1ch] overflow-hidden">
      <span
        className="absolute inset-x-0 top-0 flex flex-col"
        style={{
          transform: `translateY(${rolled || reduce ? -digit : 0}lh)`,
          transition: reduce
            ? "none"
            : `transform 600ms cubic-bezier(.32,.72,0,1) ${index * 70}ms`,
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
function Odometer({ value, reduce }: { value: string; reduce: boolean }) {
  const [rolled, setRolled] = useState(false);
  useEffect(() => {
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
        return (
          <Wheel
            key={i}
            digit={digit}
            index={index}
            rolled={rolled}
            reduce={reduce}
          />
        );
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
  // The server can't know the visitor's motion preference, so treat the first
  // render as "reduced" on both sides (no sweep) and decide after mount;
  // otherwise the markup differs and hydration fails.
  const mounted = useMounted();
  const prefersReduced = useReducedMotion() ?? false;
  const reduce = !mounted || prefersReduced;
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
            {!reduce && (
              <motion.span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-foreground/10 to-transparent"
                initial={{ x: "0%" }}
                animate={{ x: ["0%", "400%"] }}
                transition={{
                  duration: 1.1,
                  ease: EASE,
                  repeat: Number.POSITIVE_INFINITY,
                  repeatDelay: 5.5,
                  delay: 1.2,
                }}
              />
            )}
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
                <Odometer value={label} reduce={reduce} />
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
