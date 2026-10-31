"use client";

// Client component: SpotlightCard renders the core Card (a component prop).

import { Badge } from "@repo/design-system/components/ui/badge";
import { Card } from "@repo/design-system/components/ui/card";
import { cn } from "@repo/design-system/lib/utils";
import { ArrowRight } from "iconsax-reactjs";
import Link from "next/link";
import { SpotlightCard } from "@/components/fx";
import { PRESSABLE } from "@/components/mockups/motion";
import { CompetitorLogo } from "./competitor-logo";

/** The tagline's first sentence, which describes the competitor. */
function competitorSummary(tagline: string): string {
  return tagline.match(/^(.+?[.!?])\s+(?=[A-Z])/)?.[1] ?? tagline;
}

interface CompareCardProps {
  slug: string;
  competitor: string;
  tagline: string;
  competitorPlan: string;
}

/** Dense, fully clickable card for one comparison page. */
export function CompareCard({
  slug,
  competitor,
  tagline,
  competitorPlan,
}: CompareCardProps) {
  return (
    <Link
      className="group block h-full rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      href={`/compare/${slug}`}
    >
      <SpotlightCard
        as={Card}
        className={cn(
          "h-full gap-3 p-5 shadow-xs group-hover:border-foreground/15 group-hover:bg-accent/40",
          PRESSABLE,
        )}
      >
        <div className="flex items-center gap-3">
          <CompetitorLogo name={competitor} slug={slug} />
          <h3 className="min-w-0 flex-1 font-semibold tracking-tight text-pretty sm:truncate">
            QRdx vs {competitor}
          </h3>
          <ArrowRight
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-foreground"
          />
        </div>
        <p className="line-clamp-2 text-sm text-pretty text-muted-foreground">
          {competitorSummary(tagline)}
        </p>
        <div className="mt-auto pt-1">
          <Badge
            className="max-w-full font-normal text-muted-foreground"
            title={`${competitor} pricing: ${competitorPlan}`}
            variant="outline"
          >
            <span className="truncate">
              <span className="text-foreground">{competitor}</span> ·{" "}
              {competitorPlan}
            </span>
          </Badge>
        </div>
      </SpotlightCard>
    </Link>
  );
}
