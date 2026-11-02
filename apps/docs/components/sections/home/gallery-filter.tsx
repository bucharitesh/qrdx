"use client";

import { type ReactNode, useState } from "react";
import { SegmentedControl } from "@/components/mockups/segmented-control";
import type { GalleryFilter as Filter } from "@/lib/landing/showcase-gallery";

interface GalleryFilterProps {
  panels: readonly { value: Filter; label: string; content: ReactNode }[];
}

/**
 * Filter chips over the gallery. Every panel is in the server HTML (for
 * search engines and no-JS readers); the hidden one's lazy images load only
 * once it is shown. Panels hold the same number of tiles, so switching never
 * moves the page below.
 */
export function GalleryFilter({ panels }: GalleryFilterProps) {
  const [value, setValue] = useState<Filter>(panels[0]?.value ?? "style");

  return (
    <div className="flex w-full flex-col items-center gap-8">
      <SegmentedControl
        label="Show codes by"
        options={panels.map(({ value, label }) => ({ value, label }))}
        value={value}
        onChange={setValue}
      />
      {panels.map((panel) => (
        <div
          key={panel.value}
          hidden={panel.value !== value}
          className="w-full"
        >
          {panel.content}
        </div>
      ))}
    </div>
  );
}
