"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Skeleton } from "@repo/design-system/components/ui/skeleton";
import { cn } from "@repo/design-system/lib/utils";
import { Moon, MoreVertical, Sun } from "lucide-react";
import { QrdxLogo } from "@/components/qrdx-logo";
import type { ThemePreset, ThemeStyles } from "@/types/theme";

// This is repeating from `dashboard/components/theme-card.tsx`
type SwatchDefinition = {
  name: string; // Text to display on hover
  bgKey: keyof ThemeStyles; // Key for background color
  fgKey: keyof ThemeStyles; // Key for text color
};

// This is repeating from `dashboard/components/theme-card.tsx`
const swatchDefinitions: SwatchDefinition[] = [
  { name: "Primary", bgKey: "bgColor", fgKey: "fgColor" },
];

export function CommunityThemeCard({
  themePreset,
}: {
  themePreset: ThemePreset;
}) {
  return (
    <div className="group/card relative flex flex-col gap-2">
      <div className="group/preview relative flex h-56 overflow-hidden rounded-lg border">
        <div className="from-foreground/20 to-foreground-10 absolute inset-0 z-1 flex flex-col items-center justify-center gap-2 bg-gradient-to-b opacity-0 transition-opacity duration-300 ease-in-out group-hover/preview:opacity-100">
          <Button variant="outline" size="sm" className="w-28 drop-shadow">
            View Details
          </Button>
          <Button size="sm" className="w-28 drop-shadow">
            View in Editor
          </Button>
        </div>

        {/* TEMPORARY CARD IMPLEMENTATION: Based on `dashboard/components/theme-card.tsx` */}
        <div className="relative isolate flex flex-1 flex-col">
          {/* Light mode swatches */}
          <div className="group relative flex flex-1">
            <div className="absolute top-2 left-2 z-10 size-6">
              <Sun className="size-full opacity-80 drop-shadow-2xl transition-opacity group-hover/preview:opacity-100" />
            </div>
            {swatchDefinitions.map((swatch) => (
              <div
                key={`${swatch.name + swatch.bgKey}light`}
                className={cn(
                  "group/swatch relative h-full flex-1 transition-all duration-300 ease-in-out",
                )}
                style={{
                  backgroundColor: themePreset.styles.bgColor?.toString(),
                }}
              ></div>
            ))}
          </div>

          {/* Dark mode swatches */}
          <div className="group relative flex flex-1">
            <div className="absolute right-2 bottom-2 z-10 size-6">
              <Moon className="size-full opacity-80 drop-shadow-2xl transition-opacity group-hover/preview:opacity-100" />
            </div>
            {swatchDefinitions.map((swatch) => (
              <div
                key={`${swatch.name + swatch.bgKey}dark`}
                className={cn(
                  "group/swatch relative h-full flex-1 transition-all duration-300 ease-in-out",
                )}
                style={{
                  backgroundColor: themePreset.styles.bgColor?.toString(),
                }}
              ></div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div
          className="from-primary to-secondary aspect-square size-10 rounded-full border bg-linear-150/oklch"
          style={
            {
              "--primary": themePreset.styles.fgColor?.toString(),
              "--primary-foreground": themePreset.styles.fgColor?.toString(),
              "--secondary": themePreset.styles.bgColor?.toString(),
            } as React.CSSProperties
          }
        >
          <QrdxLogo className="text-primary-foreground size-full p-2 drop-shadow-lg" />
        </div>
        <div className="flex flex-col gap-1">
          <h3 className="line-clamp-1 text-sm leading-none font-medium">
            {themePreset.label}
          </h3>
          <p className="text-muted-foreground line-clamp-1 text-xs">
            {themePreset.createdAt ?? "Unknown creation date"}
          </p>
        </div>

        <Button variant="ghost" size="icon" className="ml-auto">
          <MoreVertical />
        </Button>
      </div>
    </div>
  );
}

export function CommunityThemeCardSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-56 w-full rounded-lg" />

      <div className="flex items-center gap-2">
        <Skeleton className="aspect-square size-10 rounded-full" />
        <div className="flex w-full flex-col gap-1.5">
          <Skeleton className="line-clamp-1 h-4 w-1/2 rounded-lg leading-none font-medium" />
          <Skeleton className="text-muted-foreground h-3 w-1/3 rounded-lg" />
        </div>

        <MoreVertical className="text-muted ml-auto animate-pulse" />
      </div>
    </div>
  );
}
