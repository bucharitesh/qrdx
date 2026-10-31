"use client";

import { cn } from "@repo/design-system/lib/utils";
import { type ReactNode, useEffect, useRef, useState } from "react";

/**
 * Renders children at a fixed phone width and scales them down to fit the
 * box (template thumbnails). Not interactive.
 */
export function ScaledPreview({
  children,
  width = 390,
  className,
}: {
  children: ReactNode;
  /** Layout width of the content before scaling, in px */
  width?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => setScale(node.clientWidth / width);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [width]);

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none relative overflow-hidden select-none",
        className,
      )}
      ref={ref}
    >
      {scale > 0 && (
        <div
          className="absolute top-0 left-0 origin-top-left"
          // inert keeps links and buttons out of the tab order.
          inert
          style={{
            width,
            height: `${100 / scale}%`,
            transform: `scale(${scale})`,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
