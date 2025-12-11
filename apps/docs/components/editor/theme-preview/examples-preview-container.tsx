import { Skeleton } from "@repo/design-system/components/ui/skeleton";
import { cn } from "@repo/design-system/lib/utils";
import { Suspense } from "react";
import { QrdxLogoAnimation } from "@/components/qrdx-logo-animation";

const LoadingSkeleton = () => (
  <div className="absolute inset-0 flex flex-col">
    <div className="flex flex-1 flex-col">
      <Skeleton className="w-full flex-1 opacity-50" />
    </div>

    <div className="absolute inset-0 flex items-center justify-center">
      <QrdxLogoAnimation size={100} />
    </div>
  </div>
);

const ExamplesPreviewContainer = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <div className={cn("space-y-6", className)}>
      <div className="@container mt-0 h-full w-full space-y-6 flex items-center justify-center">
        <Suspense fallback={<LoadingSkeleton />}>{children}</Suspense>
      </div>
    </div>
  );
};

export default ExamplesPreviewContainer;
