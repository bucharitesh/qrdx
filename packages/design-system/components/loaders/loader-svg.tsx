import { cn } from "@repo/design-system/lib/utils";
import type { ComponentProps, CSSProperties, ReactNode } from "react";

/** The sizes the loaders are drawn for, in px. */
export type LoaderSize = 16 | 24 | 40 | 64;

export interface LoaderProps
  extends Omit<ComponentProps<"svg">, "children" | "viewBox"> {
  /** Width and height in px. A `size-*` class in `className` wins over it. */
  size?: LoaderSize;
  /**
   * What screen readers announce; it isn't shown. Pass the page's own
   * translation where it has one. Ignored with `aria-hidden`.
   */
  label?: string;
  /** Milliseconds before the loader shows, so quick loads never flash it. */
  delay?: number;
}

/** The label when a page passes none. */
export const DEFAULT_LOADER_LABEL = "Loading…";

/** The wait before a loader shows, in ms (the delay prop's default). */
export const LOADER_DELAY = 300;

/**
 * The shell every loader draws in. The SVG itself is decorative; beside it a
 * visually hidden `role="status"` carries the label. With `aria-hidden` (a
 * loader inside a button whose text already says what's happening) the
 * status is left out. The SVG stays a direct child of its parent, so the
 * loader takes an icon's place in a button or a toast without changing its
 * layout.
 */
export function LoaderSvg({
  children,
  className,
  delay = LOADER_DELAY,
  label = DEFAULT_LOADER_LABEL,
  size,
  style,
  viewBox,
  ...props
}: LoaderProps & { children: ReactNode; viewBox: string }) {
  const hidden =
    props["aria-hidden"] === true || props["aria-hidden"] === "true";
  return (
    <>
      {hidden ? null : (
        <span className="sr-only" role="status">
          {label}
        </span>
      )}
      <svg
        data-slot="loader"
        fill="currentColor"
        height={size}
        viewBox={viewBox}
        width={size}
        xmlns="http://www.w3.org/2000/svg"
        {...props}
        aria-hidden="true"
        className={cn("qrdx-loader", className)}
        focusable="false"
        style={{ "--loader-delay": `${delay}ms`, ...style } as CSSProperties}
      >
        {children}
      </svg>
    </>
  );
}
