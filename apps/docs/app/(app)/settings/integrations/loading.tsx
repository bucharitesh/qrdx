import { Skeleton } from "@repo/design-system/components/ui/skeleton";
import { SettingsHeader } from "../components/settings-header";

export default function IntegrationsLoading() {
  return (
    <div className="space-y-6">
      <SettingsHeader
        title="Integrations"
        description="Connect third-party services to enhance your QR codes"
      />

      <div className="space-y-8">
        {/* Search skeleton */}
        <Skeleton className="h-9 w-full" />

        {/* Category section skeleton */}
        {[1, 2].map((section) => (
          <div key={section} className="space-y-3">
            <Skeleton className="h-4 w-28" />
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="rounded-xl border bg-card p-4 space-y-3"
                >
                  <Skeleton className="size-10 rounded-lg" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-3/4" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
