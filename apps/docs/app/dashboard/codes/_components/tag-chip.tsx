import { cn } from "@repo/design-system/lib/utils";
import {
  TAG_DOT_CLASS,
  tagColor,
} from "@/app/dashboard/codes/_lib/organize-shared";

export function TagDot({
  color,
  className,
}: {
  color: string | null | undefined;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        TAG_DOT_CLASS[tagColor(color)],
        className,
      )}
    />
  );
}

export function TagChip({
  name,
  color,
  className,
}: {
  name: string;
  color: string | null | undefined;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "bg-muted/60 text-foreground inline-flex max-w-40 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] leading-none font-medium",
        className,
      )}
    >
      <TagDot color={color} className="size-1.5" />
      <span className="truncate">{name}</span>
    </span>
  );
}
