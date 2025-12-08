/** biome-ignore-all lint/a11y/noStaticElementInteractions: <explanation> */
/** biome-ignore-all lint/a11y/useKeyWithClickEvents: <explanation> */
"use client";

import { cn } from "@repo/design-system/lib/utils";
import type { LucideIcon } from "lucide-react";

interface ContentTypeCardProps {
  label: string;
  description: string;
  icon: LucideIcon;
  isActive?: boolean;
  onClick: () => void;
  variant?: "default" | "carousel";
}

export function ContentTypeCard({
  label,
  description,
  icon: Icon,
  isActive = false,
  onClick,
}: ContentTypeCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative flex flex-col items-center gap-3 rounded-xl border p-6 text-center transition-all hover:border-primary hover:bg-accent",
        isActive
          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
          : "border-border bg-card",
      )}
    >
      {/* Icon container with gradient background */}
      <div
        className={cn(
          "flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 transition-all",
          isActive && "scale-110",
        )}
      >
        <Icon
          className={cn(
            "size-8 text-primary/60 transition-colors",
            isActive && "text-primary",
          )}
        />
      </div>

      {/* Text content */}
      <div className="space-y-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-muted-foreground text-xs">{description}</div>
      </div>
    </div>
  );
}
