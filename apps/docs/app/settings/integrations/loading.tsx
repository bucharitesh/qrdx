import { Skeleton } from "@repo/design-system/components/ui/skeleton";
import { SettingsHeader } from "../components/settings-header";

export default function IntegrationsLoading() {
  return (
    <div className="space-y-6">
      <SettingsHeader
        title="Integrations"
        description="Connect third-party services to enhance your QR codes"
      />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-4 rounded-lg border p-6">
          <div className="flex items-start gap-3">
            <Skeleton className="size-10 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-4 w-full" />
            </div>
          </div>
          <Skeleton className="h-10 w-full" />
        </div>

        <div className="space-y-4 rounded-lg border p-6">
          <div className="flex items-start gap-3">
            <Skeleton className="size-10 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-4 w-full" />
            </div>
          </div>
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    </div>
  );
}






