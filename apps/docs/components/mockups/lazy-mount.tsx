"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

interface LazyMountProps {
  /** Rendered on the server and until the slot nears the viewport. Match the final size. */
  fallback: ReactNode;
  /** Usually a next/dynamic component, so its JS is only fetched when mounted. */
  children: ReactNode;
  className?: string;
  rootMargin?: string;
}

/** Mounts an interactive island only when it is about to scroll into view. */
export function LazyMount({
  fallback,
  children,
  className,
  rootMargin = "300px 0px",
}: LazyMountProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);

  return (
    <div ref={ref} className={className}>
      {visible ? children : fallback}
    </div>
  );
}
