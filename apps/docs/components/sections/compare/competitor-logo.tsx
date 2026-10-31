import { cn } from "@repo/design-system/lib/utils";

interface CompetitorLogoProps {
  name: string;
  src?: string;
  className?: string;
}

/** Competitor logo, or a monogram when the compare entry has no logo URL. */
export function CompetitorLogo({ name, src, className }: CompetitorLogoProps) {
  if (!src) {
    return (
      <span
        role="img"
        aria-label={`${name} logo`}
        className={cn(
          "flex items-center justify-center rounded-lg border border-border bg-muted font-mono text-xs font-semibold text-secondary-foreground",
          className,
        )}
      >
        {name.slice(0, 2)}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={`${name} logo`}
      className={cn("object-contain", className)}
    />
  );
}
