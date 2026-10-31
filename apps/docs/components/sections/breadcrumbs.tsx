import { cn } from "@repo/design-system/lib/utils";
import { ChevronRight } from "lucide-react";
import Link from "next/link";

export interface BreadcrumbItem {
  name: string;
  path: string;
}

interface BreadcrumbsProps {
  /** Full trail including the current page (last item, not linked). */
  items: BreadcrumbItem[];
  align?: "center" | "start";
  className?: string;
}

/** Visible breadcrumb trail. Pages add BreadcrumbList JSON-LD separately. */
export function Breadcrumbs({
  items,
  align = "center",
  className,
}: BreadcrumbsProps) {
  const trail = items.slice(0, -1);
  const current = items.at(-1);

  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol
        className={cn(
          "flex flex-wrap items-center gap-1 text-xs text-muted-foreground",
          align === "center" ? "justify-center" : "justify-start",
        )}
      >
        {trail.map((crumb) => (
          <li key={crumb.path} className="flex items-center gap-1">
            <Link
              href={crumb.path}
              className="hover:text-foreground transition-colors"
            >
              {crumb.name}
            </Link>
            <ChevronRight aria-hidden className="size-3" />
          </li>
        ))}
        {current && (
          <li
            aria-current="page"
            className="max-w-[40ch] truncate text-foreground"
          >
            {current.name}
          </li>
        )}
      </ol>
    </nav>
  );
}
