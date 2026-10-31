"use client";

import { cn } from "@repo/design-system/lib/utils";
import {
  type CSSProperties,
  cloneElement,
  type ElementType,
  isValidElement,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
} from "react";

interface SpotlightCardProps {
  /** Element or component to render, e.g. "article", Card or next/link's Link. Default "div". */
  as?: ElementType;
  /**
   * Put the spotlight on the single child element instead of a wrapper, e.g.
   * `<SpotlightCard asChild><Card>…</Card></SpotlightCard>`. Use this from
   * server components, which can't pass a component as `as`.
   */
  asChild?: boolean;
  className?: string;
  children?: ReactNode;
  /** Any other prop is passed to `as` (href, aria-*, data-*, handlers…). */
  [prop: string]: unknown;
}

type PointerHandler = (event: PointerEvent<HTMLElement>) => void;

type ChildProps = { className?: string; children?: ReactNode };

const FILL: CSSProperties = {
  background:
    "radial-gradient(340px circle at var(--spot-x, 50%) var(--spot-y, 50%), color-mix(in oklab, var(--foreground) 5.5%, transparent), transparent 70%)",
};

const RING: CSSProperties = {
  padding: 1,
  background:
    "radial-gradient(220px circle at var(--spot-x, 50%) var(--spot-y, 50%), color-mix(in oklab, var(--foreground) 42%, transparent), transparent 72%)",
  WebkitMask:
    "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
  WebkitMaskComposite: "xor",
  mask: "linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0)",
};

/**
 * Card wrapper with a soft highlight that follows a mouse or pen across the
 * surface and lights the border near it. Pointer moves only set two CSS
 * variables (no React render); touch gets the plain card. Bring your own
 * border, radius and background via className.
 */
export function SpotlightCard({
  as,
  asChild = false,
  className,
  children,
  ...rest
}: SpotlightCardProps) {
  const Comp: ElementType = as ?? "div";
  const props = rest as Record<string, unknown> & {
    onPointerMove?: PointerHandler;
    onPointerLeave?: PointerHandler;
  };
  const { onPointerMove, onPointerLeave } = props;

  const move: PointerHandler = (event) => {
    onPointerMove?.(event);
    if (event.pointerType === "touch") return;
    const el = event.currentTarget;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--spot-x", `${event.clientX - rect.left}px`);
    el.style.setProperty("--spot-y", `${event.clientY - rect.top}px`);
    if (!("spot" in el.dataset)) el.dataset.spot = "";
  };

  const leave: PointerHandler = (event) => {
    onPointerLeave?.(event);
    delete event.currentTarget.dataset.spot;
  };

  const glow = (
    <>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 rounded-[inherit] opacity-0 transition-opacity duration-300 ease-[cubic-bezier(.32,.72,0,1)] group-data-[spot]/spot:opacity-100"
        style={FILL}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -inset-px -z-10 rounded-[inherit] opacity-0 transition-opacity duration-300 ease-[cubic-bezier(.32,.72,0,1)] group-data-[spot]/spot:opacity-100"
        style={RING}
      />
    </>
  );

  if (asChild && isValidElement<ChildProps>(children)) {
    return cloneElement(
      children as ReactElement<Record<string, unknown>>,
      {
        ...props,
        onPointerMove: move,
        onPointerLeave: leave,
        className: cn(
          "group/spot relative isolate",
          children.props.className,
          className,
        ),
      },
      glow,
      children.props.children,
    );
  }

  return (
    <Comp
      {...props}
      onPointerMove={move}
      onPointerLeave={leave}
      className={cn("group/spot relative isolate", className)}
    >
      {glow}
      {children}
    </Comp>
  );
}
