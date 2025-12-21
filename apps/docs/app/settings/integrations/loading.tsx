import { Skeleton } from "@repo/design-system/components/ui/skeleton";
import {
  Card,
  CardHeader,
} from "@repo/design-system/components/ui/card";
import { SettingsHeader } from "../components/settings-header";

export default function IntegrationsLoading() {
  return (
    <div className="space-y-6">
      <SettingsHeader
        title="Integrations"
        description="Connect third-party services to enhance your QR codes"
      />

      <div className="grid gap-4 grid-cols-1">
        {[1, 2].map((i) => (
          <Card key={i}>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3 flex-1">
                  <Skeleton className="size-10 rounded-lg shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-full max-w-md" />
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Skeleton className="h-8 w-20" />
                </div>
              </div>
            </CardHeader>

            <div className="px-6 pb-2 space-y-1">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-full max-w-md" />
            </div>

            <div className="px-6 pb-3">
              <Skeleton className="h-4 w-20" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
