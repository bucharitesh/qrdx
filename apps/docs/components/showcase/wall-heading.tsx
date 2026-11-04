import { cn } from "@repo/design-system/lib/utils";
import { ArrowRight } from "iconsax-reactjs";
import Link from "next/link";
import { type ReactNode, ViewTransition } from "react";
import { EASE_CLASS } from "@/components/mockups/motion";

// The "Made with QRdx" heading, shared by the home wall and the community
// wall. Both wrap it in a <ViewTransition> with one name, so following
// "Show more" or "See all" from the home page carries the heading across
// while the page cross-fades (React's View Transitions, which Next.js runs
// on every navigation; browsers without the API just navigate). It never
// animates on other navigations, and not at all with reduced motion.

/** Hoisted once into <head> by React (same href). */
const TRANSITION_CSS = `::view-transition-group(.made-with-qrdx){animation-duration:420ms;animation-timing-function:cubic-bezier(.32,.72,0,1)}@media (prefers-reduced-motion:reduce){::view-transition-group(*),::view-transition-old(*),::view-transition-new(*){animation:none!important}}`;

export const WALL_PATH = "/community#made-with-qrdx";

export function WallLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group/link inline-flex shrink-0 items-center gap-1.5 rounded-sm text-sm font-medium text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
    >
      {children}
      <ArrowRight
        aria-hidden="true"
        className={cn(
          "size-3.5 transition-transform duration-200 group-hover/link:translate-x-0.5 motion-reduce:transition-none",
          EASE_CLASS,
        )}
      />
    </Link>
  );
}

export function WallHeading({
  id,
  title,
  description,
  action,
  as: Heading = "h2",
}: {
  /** id of the heading element (for aria-labelledby). */
  id: string;
  title: string;
  description: ReactNode;
  action?: ReactNode;
  as?: "h1" | "h2";
}) {
  return (
    <>
      <style href="made-with-qrdx-transition" precedence="default">
        {TRANSITION_CSS}
      </style>
      <ViewTransition
        name="made-with-qrdx-heading"
        share="made-with-qrdx"
        default="none"
      >
        <div className="flex items-end justify-between gap-6">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Heading
              id={id}
              className="text-2xl font-medium tracking-tighter text-balance md:text-3xl"
            >
              {title}
            </Heading>
            <p className="text-muted-foreground max-w-xl text-sm text-pretty md:text-base">
              {description}
            </p>
          </div>
          {action}
        </div>
      </ViewTransition>
    </>
  );
}
