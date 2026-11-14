"use client";

// Below-the-fold demos: their JS is fetched only when the slot nears the
// viewport. Until then (and on the server) a same-size skeleton holds the space.

import { cn } from "@repo/design-system/lib/utils";
import dynamic from "next/dynamic";
import { LazyMount } from "@/components/mockups/lazy-mount";

function DemoSkeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("flex size-full items-center justify-center", className)}
    >
      <div className="aspect-square w-32 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
    </div>
  );
}

const StudioDemo = dynamic(
  () => import("./demos/studio-demo").then((mod) => mod.StudioDemo),
  { ssr: false, loading: () => <DemoSkeleton /> },
);
const ScanScoreDemo = dynamic(
  () => import("./demos/scan-score-demo").then((mod) => mod.ScanScoreDemo),
  { ssr: false, loading: () => <DemoSkeleton /> },
);
const PrintSizeDemo = dynamic(
  () => import("./demos/print-size-demo").then((mod) => mod.PrintSizeDemo),
  { ssr: false, loading: () => <DemoSkeleton /> },
);
const DynamicDemo = dynamic(
  () => import("./demos/dynamic-demo").then((mod) => mod.DynamicDemo),
  { ssr: false, loading: () => <DemoSkeleton /> },
);
const AnalyticsDemo = dynamic(
  () => import("./demos/analytics-demo").then((mod) => mod.AnalyticsDemo),
  { ssr: false, loading: () => <DemoSkeleton /> },
);

const DEMOS = {
  studio: StudioDemo,
  "scan-score": ScanScoreDemo,
  "print-size": PrintSizeDemo,
  dynamic: DynamicDemo,
  analytics: AnalyticsDemo,
};

export type LiveDemoName = keyof typeof DEMOS;

/** Fixed-size slot (set via className) that mounts the named demo when near view. */
export function LiveDemo({
  name,
  className,
}: {
  name: LiveDemoName;
  className?: string;
}) {
  const Demo = DEMOS[name];
  return (
    <LazyMount className={className} fallback={<DemoSkeleton />}>
      <Demo />
    </LazyMount>
  );
}
