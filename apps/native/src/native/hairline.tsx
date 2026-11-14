import { cn } from "@repo/design-system/lib/utils";
import { ScanBarcode } from "iconsax-reactjs";

// The empty-history illustration (@repo/design-system/components/hairline/
// hairline.tsx) loads its figures with next/dynamic; the app shows a still
// icon in its place.
export function HairlineFigure({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "grid place-items-center rounded-xl border bg-muted/40 text-muted-foreground",
        className
      )}
    >
      <ScanBarcode className="size-7" variant="Linear" />
    </div>
  );
}
