"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { ArrowDown2, ArrowUp2 } from "iconsax-reactjs";
import { type ReactNode, useState } from "react";

/** Shows the top of a long code block with an expand button under a fade. */
export function CollapsibleCode({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <div
        className={cn(
          !open && "max-h-72 overflow-hidden [&_[role=region]]:overflow-hidden",
        )}
      >
        {children}
      </div>
      {open ? (
        <div className="mt-2 flex justify-center">
          <Button onClick={() => setOpen(false)} size="sm" variant="ghost">
            <ArrowUp2 aria-hidden="true" />
            Collapse
          </Button>
        </div>
      ) : (
        <div className="absolute inset-x-0 bottom-0 flex h-32 items-end justify-center rounded-b-xl border border-t-0 bg-linear-to-t from-30% from-fd-card via-fd-card/80 to-transparent pb-4">
          <Button onClick={() => setOpen(true)} size="sm" variant="secondary">
            <ArrowDown2 aria-hidden="true" />
            Expand
          </Button>
        </div>
      )}
    </div>
  );
}
