import { cn } from "@repo/design-system/lib/utils";
import type { ReactNode } from "react";

interface BentoCardProps {
  gridClass?: string;
  padding?: string;
  title: string;
  description: string;
  icon?: ReactNode;
  children: ReactNode;
  contentClassName?: string;
  footerClassName?: string;
}

export function BentoCard({
  gridClass = "",
  padding = "p-8",
  title,
  description,
  icon,
  children,
  contentClassName = "flex-1",
  footerClassName = "mt-auto",
}: BentoCardProps) {
  return (
    <div
      className={cn(
        "bg-muted/50 border border-border rounded-xl flex flex-col overflow-hidden",
        padding,
        gridClass,
      )}
    >
      <div className={contentClassName}>{children}</div>
      <div className={footerClassName}>
        <h3 className="text-xl font-medium flex items-center gap-2">
          {icon}
          {title}
        </h3>
        <p className="text-muted-foreground text-sm mt-1">{description}</p>
      </div>
    </div>
  );
}
