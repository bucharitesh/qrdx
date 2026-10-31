"use client";

import { Badge } from "@repo/design-system/components/ui/badge";
import { Card } from "@repo/design-system/components/ui/card";
import { cn } from "@repo/design-system/lib/utils";
import {
  CATALOG_KIND_LABELS,
  getCategoryLabel,
  type IntegrationCatalogEntry,
} from "@repo/integrations/src/catalog";
import { ArrowRight } from "iconsax-reactjs";
import Link from "next/link";
import { SpotlightCard } from "@/components/fx";
import { PRESSABLE } from "@/components/mockups/motion";
import { NeedsSetupBadge } from "@/components/needs-setup";
import { IntegrationLogo } from "./integration-logo";

interface IntegrationCardProps {
  entry: IntegrationCatalogEntry;
  className?: string;
  /** Local dev only: env variable names it still needs (never values). */
  needsSetup?: string[];
}

/** Dense directory card: logo, name, one-liner, kind badge. The card is the link. */
export function IntegrationCard({
  entry,
  className,
  needsSetup,
}: IntegrationCardProps) {
  return (
    <Link
      href={`/integrations/${entry.slug}`}
      className={cn(
        "group block h-full rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        PRESSABLE,
        className,
      )}
    >
      <SpotlightCard
        as={Card}
        className="h-full gap-3 p-5 shadow-xs transition-colors duration-200 group-hover:border-foreground/15 group-hover:bg-accent/40 dark:shadow-none"
      >
        <div className="flex items-start justify-between gap-3">
          <IntegrationLogo logo={entry.logo} />
          {needsSetup?.length ? (
            <NeedsSetupBadge names={needsSetup} />
          ) : (
            <Badge
              variant="outline"
              className="font-normal text-muted-foreground"
            >
              {CATALOG_KIND_LABELS[entry.kind]}
            </Badge>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="font-medium leading-snug text-foreground">
            {entry.name}
          </h3>
          <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground text-pretty">
            {entry.tagline}
          </p>
        </div>
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{getCategoryLabel(entry.categories[0] ?? "developers")}</span>
          <ArrowRight
            aria-hidden
            className="size-4 transition-[transform,color] duration-200 group-hover:translate-x-0.5 group-hover:text-foreground"
          />
        </div>
      </SpotlightCard>
    </Link>
  );
}
