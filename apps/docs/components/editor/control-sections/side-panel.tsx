"use client";

import { Close } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/design-system/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@repo/design-system/components/ui/sheet";
import useMediaQuery from "@repo/design-system/hooks/use-media-query";
import { useTranslations } from "next-intl";
import {
  createContext,
  type ReactNode,
  type RefObject,
  useContext,
  useId,
  useMemo,
} from "react";
import {
  clearOfBanner,
  useConsentBannerInset,
} from "@/components/consent/banner-inset";

// Shape catalogs and the shape sections (eyes, frame) open beside the design
// panel instead of growing it, so the code preview stays in view: a popover
// to the side on wider screens, a bottom sheet on phones. Content is portaled,
// so a modal (the dashboard's code builder) can't clip it.

type Side = "left" | "right";

const SidePanelContext = createContext<{ inside: boolean; side: Side }>({
  inside: false,
  side: "right",
});

/**
 * Which side the panels open on. The playground's panel is on the left of
 * the screen (panels open right); the code builder's style column is on the
 * right of its modal, so it passes "left".
 */
export function SidePanelPlacement({
  side,
  children,
}: {
  side: Side;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ inside: false, side }), [side]);
  return (
    <SidePanelContext.Provider value={value}>
      {children}
    </SidePanelContext.Provider>
  );
}

/** The side panels open on ("right" unless SidePanelPlacement says). */
export function useSidePanelSide(): Side {
  return useContext(SidePanelContext).side;
}

/**
 * The gap that puts a panel `clearance` px beyond `outer` (the picker's full
 * row) when it opens from `trigger` (a tile inside that row).
 */
export function offsetBeyond(
  side: Side,
  trigger: { left: number; right: number },
  outer: { left: number; right: number },
  clearance: number,
): number {
  const inset =
    side === "left" ? trigger.left - outer.left : outer.right - trigger.right;
  return Math.max(0, inset) + clearance;
}

/**
 * Content that already floats beside the code (the preview's part menus):
 * shape catalogs inside it expand in place, like in a side panel.
 */
export function InsideSidePanel({ children }: { children: ReactNode }) {
  const { side } = useContext(SidePanelContext);
  const value = useMemo(() => ({ inside: true, side }), [side]);
  return (
    <SidePanelContext.Provider value={value}>
      {children}
    </SidePanelContext.Provider>
  );
}

/** Inside a side panel already: nested catalogs expand in place. */
export function useInsideSidePanel(): boolean {
  return useContext(SidePanelContext).inside;
}

/** Phones (no room at the side) get a bottom sheet. */
export const SIDE_PANEL_SHEET_QUERY = "(max-width: 767px)";

/** Touch screens would pop the keyboard if search took focus on open. */
export function focusOnOpen(pointerFine: boolean): "search" | "panel" {
  return pointerFine ? "search" : "panel";
}

export function SidePanel({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  initialFocus,
  sideOffset = 12,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The element that opens it; focus returns to it on close */
  trigger: ReactNode;
  title: string;
  /** For screen readers (the sheet's description) */
  description?: string;
  /** Focused on open with a mouse or keyboard (e.g. a search box) */
  initialFocus?: RefObject<HTMLElement | null>;
  /** Gap from the trigger */
  sideOffset?: number;
  children: ReactNode;
}) {
  const t = useTranslations("editor.controlSections.sidePanel");
  const { side } = useContext(SidePanelContext);
  const sheet = useMediaQuery(SIDE_PANEL_SHEET_QUERY) ?? false;
  const bannerInset = useConsentBannerInset();
  const inside = useMemo(() => ({ inside: true, side }), [side]);
  // Named by its visible title, not an aria-label: the catalog grid inside
  // carries the group's name ("Dot shape") and must stay the one found by it.
  const titleId = useId();

  const onOpenAutoFocus = (event: Event) => {
    const fine = window.matchMedia("(pointer: fine)").matches;
    if (focusOnOpen(fine) === "search" && initialFocus?.current) {
      event.preventDefault();
      initialFocus.current.focus({ preventScroll: true });
    } else if (!fine) {
      // Keep the keyboard down on touch; the panel itself takes focus.
      event.preventDefault();
      (event.currentTarget as HTMLElement | null)?.focus({
        preventScroll: true,
      });
    }
  };

  const body = (
    <SidePanelContext.Provider value={inside}>
      <div className="@container min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
        {children}
      </div>
    </SidePanelContext.Provider>
  );

  if (sheet) {
    return (
      <Sheet onOpenChange={onOpenChange} open={open}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent
          // Above the code builder, which sits at z-[99] on phones.
          className="z-[120] max-h-[85svh] gap-0 rounded-t-xl p-0"
          onOpenAutoFocus={onOpenAutoFocus}
          side="bottom"
          tabIndex={-1}
        >
          <div className="px-4 pt-4 pr-12 pb-3">
            <SheetTitle className="text-sm">{title}</SheetTitle>
            <SheetDescription className="sr-only">
              {description ?? title}
            </SheetDescription>
          </div>
          {body}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover onOpenChange={onOpenChange} open={open}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="start"
        aria-labelledby={titleId}
        // Above the code builder's modal (z-[99]); never clipped by it.
        className="z-[120] flex max-h-[min(34rem,var(--radix-popover-content-available-height))] w-[min(28rem,calc(100vw-2rem))] flex-col gap-0 p-0"
        // Never across the cookie banner while it shows
        collisionPadding={clearOfBanner(12, bannerInset)}
        onOpenAutoFocus={onOpenAutoFocus}
        side={side}
        sideOffset={sideOffset}
        tabIndex={-1}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 py-2 pr-2 pl-3">
          <p className="text-sm font-medium" id={titleId}>
            {title}
          </p>
          <Button
            aria-label={t("closeTitle", { title: title.toLowerCase() })}
            onClick={() => onOpenChange(false)}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <Close />
          </Button>
        </div>
        {body}
      </PopoverContent>
    </Popover>
  );
}
