import { Badge } from "@repo/design-system/components/ui/badge";
import { cn } from "@repo/design-system/lib/utils";
import { Setting2 } from "iconsax-reactjs";

// Local dev only: integrations whose credentials aren't set are still shown,
// marked with the env variable NAMES they need (never values). Production
// and preview builds hide them instead, so visitors never see this.

const list = (names: readonly string[]) => names.join(", ");

/** Small neutral badge; the names are in its tooltip. Renders nothing without names. */
export function NeedsSetupBadge({
  names,
  className,
}: {
  names?: readonly string[];
  className?: string;
}) {
  if (!names?.length) return null;
  return (
    <Badge
      variant="outline"
      title={`Needs setup: ${list(names)}`}
      className={cn("gap-1 font-normal text-muted-foreground", className)}
    >
      <Setting2 aria-hidden className="size-3" />
      Needs setup
      <span className="sr-only">: {list(names)}</span>
    </Badge>
  );
}

/** One line, "Needs setup: NAME, NAME", for detail views and pickers. */
export function NeedsSetupNote({
  names,
  className,
}: {
  names?: readonly string[];
  className?: string;
}) {
  if (!names?.length) return null;
  return (
    <p
      className={cn(
        "flex items-start gap-1.5 text-muted-foreground text-xs",
        className,
      )}
    >
      <Setting2 aria-hidden className="mt-px size-3.5 shrink-0" />
      <span className="min-w-0 text-pretty">
        Needs setup:{" "}
        <code className="break-all font-mono text-[11px] text-foreground/80">
          {list(names)}
        </code>
      </span>
    </p>
  );
}
