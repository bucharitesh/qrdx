import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { Skeleton } from "@repo/design-system/components/ui/skeleton";
import { cn } from "@repo/design-system/lib/utils";
import { type ReactNode, Suspense } from "react";
import { SectionBoundary } from "./section-boundary";

/**
 * A titled card whose content streams in on its own (Suspense) and fails on
 * its own (error boundary), so one slow or broken query never blocks or
 * breaks the rest of the page.
 */
export function Panel({
  id,
  title,
  description,
  children,
  className,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("min-w-0 scroll-mt-20 gap-3 py-4", className)} id={id}>
      <CardHeader className="px-4">
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="min-w-0 px-4">
        <SectionBoundary name={id}>
          <Suspense fallback={<PanelSkeleton />}>{children}</Suspense>
        </SectionBoundary>
      </CardContent>
    </Card>
  );
}

export function PanelSkeleton() {
  return (
    <div aria-hidden className="space-y-2">
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-4 w-3/5" />
    </div>
  );
}

export function LoadFailed() {
  return (
    <p className="text-muted-foreground py-2 text-sm">
      Couldn&apos;t load this section. The error is in the server log; reload to
      try again.
    </p>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground py-2 text-sm">{children}</p>;
}

/** Label / value pairs in a compact grid. */
export function Facts({
  items,
}: {
  items: { label: string; value: ReactNode }[];
}) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
      {items.map((item) => (
        <div className="min-w-0" key={item.label}>
          <dt className="text-muted-foreground text-xs">{item.label}</dt>
          <dd className="truncate font-medium tabular-nums">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** One line item: what it is, details under it, actions on the right. */
export function Row({
  title,
  meta,
  children,
  actions,
}: {
  title: ReactNode;
  meta?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <li className="flex min-w-0 flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-0.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
          {title}
        </div>
        {meta && (
          <p className="text-muted-foreground text-xs break-words">{meta}</p>
        )}
        {children}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
          {actions}
        </div>
      )}
    </li>
  );
}

export function Rows({ children }: { children: ReactNode }) {
  return <ul className="divide-border divide-y">{children}</ul>;
}

/** A small uppercase heading inside a panel. */
export function SubHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-muted-foreground mt-4 mb-2 text-xs font-medium tracking-wide uppercase first:mt-0">
      {children}
    </h3>
  );
}
