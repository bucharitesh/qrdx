"use client";

import { Badge } from "@repo/design-system/components/ui/badge";
import { motion, useReducedMotion } from "motion/react";
import { DURATION, EASE } from "@/components/mockups/motion";
import { QrdxLogo } from "@/components/qrdx-logo";
import { CompetitorLogo } from "@/components/sections/compare/competitor-logo";

interface CompareHeroLogosProps {
  slug: string;
  competitor: string;
}

/** QRdx and the competitor on matching white tiles, with a "vs" between. */
export function CompareHeroLogos({ slug, competitor }: CompareHeroLogosProps) {
  const reduce = useReducedMotion();
  // Same props on server and client (no hydration mismatch); reduced motion
  // just finishes instantly.
  const enter = (delay: number) => ({
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: reduce
      ? { duration: 0 }
      : { duration: DURATION.slow * 1.5, ease: EASE, delay },
  });

  return (
    <div className="flex items-center gap-4 md:gap-6">
      <motion.div {...enter(0)}>
        <span className="grid size-20 place-items-center rounded-full bg-white p-5 text-neutral-950 shadow-lg ring-1 shadow-black/5 ring-black/5 md:size-24 md:p-6 dark:shadow-black/40 dark:ring-white/10">
          <QrdxLogo className="size-full" />
          <span className="sr-only">QRdx</span>
        </span>
      </motion.div>
      <motion.div {...enter(0.08)}>
        <Badge
          className="bg-background text-muted-foreground"
          variant="outline"
        >
          vs
        </Badge>
      </motion.div>
      <motion.div {...enter(0.16)}>
        <CompetitorLogo
          className="shadow-lg shadow-black/5 dark:shadow-black/40"
          name={competitor}
          size="lg"
          slug={slug}
        />
      </motion.div>
    </div>
  );
}
