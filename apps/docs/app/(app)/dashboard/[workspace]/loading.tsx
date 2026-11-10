import { Skeleton } from "@repo/design-system/components/ui/skeleton";

/** Shown inside the app shell while a dashboard page loads, so navigation never looks frozen. */
export default function DashboardLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-6">
      <span className="sr-only">Loading…</span>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-9 w-36 rounded-full" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div className="space-y-3 rounded-xl border bg-card p-5" key={i}>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-16" />
          </div>
        ))}
      </div>
      <div className="divide-y rounded-xl border bg-card">
        {[0, 1, 2, 3, 4].map((i) => (
          <div className="flex items-center gap-4 p-4" key={i}>
            <Skeleton className="size-10 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="hidden h-8 w-20 rounded-full sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
