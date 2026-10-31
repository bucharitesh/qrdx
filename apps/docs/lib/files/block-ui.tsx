import { cn } from "@repo/design-system/lib/utils";
import type { ReactNode } from "react";
import { mutedTextClass, surfaceClass } from "@/components/landing/block-kit";

// Presentational pieces shared by the file-backed landing blocks (PDF,
// gallery, audio, video, downloads). Pure and server-renderable; colors and
// radius come from the page theme's `--lp-*` custom properties.

/** Heading + optional description above a block. */
export function BlockHeading({
  title,
  description,
}: {
  title?: string;
  description?: string;
}) {
  if (!(title || description)) return null;
  return (
    <div className="space-y-1">
      {title && <h2 className="font-semibold text-lg leading-snug">{title}</h2>}
      {description && (
        <p
          className={cn(
            "whitespace-pre-line text-sm leading-relaxed",
            mutedTextClass,
          )}
        >
          {description}
        </p>
      )}
    </div>
  );
}

/** Shown in the editor preview only, while a block has nothing to show yet. */
export function PreviewPlaceholder({
  icon,
  children,
}: {
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-(--lp-radius) border-2 border-current border-dashed px-4 py-8 text-center text-sm opacity-40">
      {icon}
      {children}
    </div>
  );
}

/** Inline notice for a file that can't be served (blocked, deleted, broken). */
export function UnavailableNotice({
  label = "File unavailable",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <output
      className={cn(
        surfaceClass,
        mutedTextClass,
        "block px-4 py-6 text-center text-sm",
        className,
      )}
    >
      {label}
    </output>
  );
}
