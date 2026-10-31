import { cn } from "@repo/design-system/lib/utils";
import { ArrowRight } from "iconsax-reactjs";
import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import { PRESSABLE } from "@/components/mockups/motion";
import { SpotlightLink } from "./spotlight-link";

export type CardIcon = ComponentType<{
  className?: string;
  "aria-hidden"?: boolean;
}>;

/** R4 icon tile: hairline square with a muted fill and a 16px icon. */
export function IconTile({
  icon: Icon,
  className,
}: {
  icon: CardIcon;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-lg border bg-muted/40 transition-colors duration-200 group-hover:bg-background",
        className,
      )}
    >
      <Icon aria-hidden className="size-4 text-foreground/80" />
    </span>
  );
}

/** The core Card surface, for cards that are links (Card is a div). */
export const cardClass =
  "rounded-xl border bg-card text-card-foreground shadow-sm";

/** Hover + press treatment shared by every clickable card. */
export const interactiveCardClass = cn(
  "group relative hover:border-foreground/15 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
  PRESSABLE,
);

interface LinkCardProps {
  href: string;
  title: ReactNode;
  description?: ReactNode;
  icon?: CardIcon;
  /** Small line under the description (badges, counts). */
  meta?: ReactNode;
  className?: string;
}

/**
 * Dense link card: icon tile, title with an arrow, one or two lines of
 * description. The whole card is the link.
 */
export function LinkCard({
  href,
  title,
  description,
  icon,
  meta,
  className,
}: LinkCardProps) {
  return (
    <SpotlightLink
      href={href}
      className={cn(
        cardClass,
        interactiveCardClass,
        "flex h-full min-w-0 items-start gap-3.5 p-4",
        className,
      )}
    >
      {icon && <IconTile icon={icon} />}
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-start gap-2 text-sm font-medium leading-snug text-foreground">
          <span className="min-w-0 text-pretty">{title}</span>
          <ArrowRight
            aria-hidden
            className="mt-0.5 ml-auto size-3.5 shrink-0 text-muted-foreground transition-[transform,color] duration-200 group-hover:translate-x-0.5 group-hover:text-foreground"
          />
        </span>
        {description && (
          <span className="line-clamp-2 text-sm leading-snug text-muted-foreground text-pretty">
            {description}
          </span>
        )}
        {meta}
      </span>
    </SpotlightLink>
  );
}

/**
 * Card grid sized by its container (1, 2 or 3 columns) that never leaves a
 * lone card on the last row: the last card spans the free columns instead.
 * Pass the items as `children` in order; `count` must match.
 */
export function CardGrid({
  count,
  max = 3,
  className,
  children,
}: {
  count: number;
  /** Most columns to use when the container is wide. */
  max?: 2 | 3;
  className?: string;
  children: ReactNode;
}) {
  // Four (or 10, 16…) cards read better as 2 × n than 3 + 3 + 1.
  const cols = max === 3 && count % 3 === 1 && count % 2 === 0 ? 2 : max;
  const odd = count % 2 === 1 && count > 1;
  const rest3 = count % 3;
  return (
    <div className={cn("@container", className)}>
      <div
        className={cn(
          "grid gap-3",
          max === 3 && cols === 3
            ? "@xl:grid-cols-2 @4xl:grid-cols-3"
            : "@xl:grid-cols-2",
          // Last card fills what is left of its row.
          odd && "@xl:[&>*:last-child]:col-span-2",
          cols === 3 &&
            (rest3 === 0
              ? "@4xl:[&>*:last-child]:col-span-1"
              : rest3 === 1 && count > 1
                ? "@4xl:[&>*:last-child]:col-span-3"
                : rest3 === 2
                  ? "@4xl:[&>*:last-child]:col-span-2"
                  : ""),
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** R4 section header: optional eyebrow, title, description, side action. */
export function SectionHeading({
  id,
  eyebrow,
  title,
  description,
  action,
  as: Tag = "h2",
  className,
}: {
  id?: string;
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  as?: "h1" | "h2" | "h3";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-end justify-between gap-x-6 gap-y-3",
        className,
      )}
    >
      <div className="flex min-w-0 max-w-2xl flex-col gap-2">
        {eyebrow && (
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {eyebrow}
          </p>
        )}
        <Tag
          id={id}
          className="text-2xl font-semibold tracking-tight text-balance md:text-3xl"
        >
          {title}
        </Tag>
        {description && (
          <p className="text-muted-foreground text-pretty">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

/** "See all →" style link for a section header. */
export function SectionLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group inline-flex shrink-0 items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      {children}
      <ArrowRight
        aria-hidden
        className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
      />
    </Link>
  );
}

/** In-text link per R4: neutral, underlined. */
export const textLinkClass =
  "font-medium text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground";
