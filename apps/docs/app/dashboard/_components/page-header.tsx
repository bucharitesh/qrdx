import type { ReactNode } from "react";

/** Title row for dashboard pages, with optional actions on the right. */
export function PageHeader({
  title,
  description,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1">
        <h1 className="truncate text-xl font-bold md:text-2xl">{title}</h1>
        {description && (
          <p className="text-muted-foreground text-sm md:text-base">
            {description}
          </p>
        )}
      </div>
      {children && (
        <div className="flex shrink-0 flex-wrap gap-2">{children}</div>
      )}
    </div>
  );
}
