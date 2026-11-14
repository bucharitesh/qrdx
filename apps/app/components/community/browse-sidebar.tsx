// The pieces every community gallery (frames, themes, collections, page
// templates, kits) builds its sidebar and toolbar from, so the five look the
// same. No "use client": the server galleries render links, the themes
// gallery (client) renders buttons with the same classes.
import { Info, Tick } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/design-system/components/ui/popover";
import { Separator } from "@repo/design-system/components/ui/separator";
import { cn } from "@repo/design-system/lib/utils";
import { ArrowDown2 } from "iconsax-reactjs";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";

/** The galleries' card grid: the sidebar leaves room for three columns. */
export const GALLERY_GRID = "grid gap-5 sm:grid-cols-2 xl:grid-cols-3";

const ROW =
  "flex w-full items-center justify-between gap-3 rounded-md px-3 py-1.5 text-left text-sm transition-colors";
const ROW_ACTIVE = "bg-foreground/10 text-foreground";
const ROW_IDLE =
  "text-muted-foreground hover:bg-foreground/5 hover:text-foreground";

interface RowProps {
  active: boolean;
  children: ReactNode;
  /** How many items the row leads to */
  count?: number;
  /** Filters ("All themes") read stronger than tags */
  strong?: boolean;
}

function RowContent({ active, children, count }: RowProps) {
  return (
    <>
      <span className="min-w-0 truncate">{children}</span>
      {count !== undefined && (
        <span
          className={cn(
            "shrink-0 text-xs tabular-nums",
            active ? "text-foreground/70" : "text-muted-foreground/60",
          )}
        >
          {count}
        </span>
      )}
    </>
  );
}

const rowClass = ({ active, strong }: Pick<RowProps, "active" | "strong">) =>
  cn(ROW, active ? ROW_ACTIVE : ROW_IDLE, (strong || active) && "font-medium");

/** A sidebar row that links to a filtered view. */
export function SidebarLink({ href, ...props }: RowProps & { href: string }) {
  return (
    <Link
      aria-current={props.active ? "true" : undefined}
      className={rowClass(props)}
      href={href}
      scroll={false}
    >
      <RowContent {...props} />
    </Link>
  );
}

/** A sidebar row that filters in place (client galleries). */
export function SidebarButton({
  onClick,
  ...props
}: RowProps & { onClick: () => void }) {
  return (
    <button
      aria-pressed={props.active}
      className={rowClass(props)}
      onClick={onClick}
      type="button"
    >
      <RowContent {...props} />
    </button>
  );
}

/** A section of the sidebar after the filters ("Tags", "Groups"). */
export function SidebarSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <>
      <Separator className="my-3!" />
      <div className="px-3 py-1">
        <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
          {title}
        </span>
      </div>
      <div className="space-y-0.5">{children}</div>
    </>
  );
}

export interface SortOption {
  label: string;
  /** Where choosing it goes (server galleries) */
  href?: string;
  /** What choosing it does (client galleries) */
  onSelect?: () => void;
  active: boolean;
}

/**
 * The sort menu: "Popular / All time" style. Groups are separated; the first
 * group can carry a label (themes: "Popular" with time ranges).
 */
export function SortMenu({
  label,
  groups,
}: {
  label: string;
  groups: { label?: string; options: SortOption[] }[];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="gap-1.5" size="sm" variant="outline">
          {label}
          <ArrowDown2 aria-hidden className="size-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {groups.map((group, index) => (
          <Fragment key={group.label ?? index}>
            {index > 0 && <DropdownMenuSeparator />}
            {group.label && (
              <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
            )}
            {group.options.map((option) =>
              option.href ? (
                <DropdownMenuItem
                  asChild
                  className="cursor-pointer justify-between"
                  key={option.label}
                >
                  <Link href={option.href} scroll={false}>
                    {option.label}
                    {option.active && <Tick className="size-3.5" />}
                  </Link>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  className="cursor-pointer justify-between"
                  key={option.label}
                  onClick={option.onSelect}
                >
                  {option.label}
                  {option.active && <Tick className="size-3.5" />}
                </DropdownMenuItem>
              ),
            )}
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The "How to publish" note at the right of the toolbar. */
export function HowToPublish({
  label = "How to publish",
  title,
  children,
  footer,
}: {
  label?: string;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          className="text-muted-foreground gap-1.5 text-xs"
          size="sm"
          variant="ghost"
        >
          <Info aria-hidden className="size-3.5" />
          <span className="hidden sm:inline">{label}</span>
          <span className="sr-only sm:hidden">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="p-4">
          <p className="text-sm font-medium">{title}</p>
          <div className="text-muted-foreground mt-1.5 text-xs leading-relaxed">
            {children}
          </div>
        </div>
        {footer && (
          <>
            <Separator />
            <div className="text-muted-foreground p-4 text-xs leading-relaxed">
              {footer}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
