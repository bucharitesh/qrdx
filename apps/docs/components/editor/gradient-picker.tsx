"use client";

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@repo/design-system/components/ui/drawer";
import { Label } from "@repo/design-system/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/design-system/components/ui/popover";
import useMediaQuery from "@repo/design-system/hooks/use-media-query";
import { cn } from "@repo/design-system/lib/utils";
import type { ColorConfig } from "qrdx/types";
import {
  forwardRef,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { roleOf } from "@/lib/paint/contrast";
import { addRecent, paintColors } from "@/lib/paint/swatches";
import {
  type FocusColorId,
  useColorControlFocus,
} from "@/store/color-control-focus-store";
import { SwatchDot } from "./paint-picker/controls";
import {
  type PaintKind,
  PaintPanel,
  paintBackground,
  paintSummary,
  QR_PAINT_KINDS,
} from "./paint-picker/paint-panel";
import { SectionContext } from "./section-context";

export {
  type PaintDesign,
  PaintDesignProvider,
  type PaintKind,
  PaintPanel,
  QR_IMAGE_KINDS,
  QR_PAINT_KINDS,
} from "./paint-picker/paint-panel";

/** Phones get the picker as a bottom sheet. */
const SHEET_QUERY = "(max-width: 767px)";

interface PaintPopoverProps {
  label: string;
  /** Picker content */
  children: ReactNode;
  /** The trigger button */
  trigger: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** A popover beside the trigger on desktop, a bottom sheet on phones. */
function PaintPopover({
  label,
  children,
  trigger,
  open,
  onOpenChange,
}: PaintPopoverProps) {
  const sheet = useMediaQuery(SHEET_QUERY) ?? false;
  if (sheet) {
    return (
      <Drawer onOpenChange={onOpenChange} open={open}>
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        {/* Above the side panels (z-[120]) and the builder (z-[99]) */}
        <DrawerContent className="z-[130] max-h-[88dvh]">
          <DrawerHeader className="pb-1 text-left">
            <DrawerTitle className="text-sm">{label}</DrawerTitle>
            <DrawerDescription className="sr-only">
              Pick a solid color, a gradient or a swatch for {label}.
            </DrawerDescription>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-6">{children}</div>
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Popover onOpenChange={onOpenChange} open={open}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label={label}
        // Above the side panels (z-[120]) and the code builder (z-[99])
        className="z-[130] max-h-[var(--radix-popover-content-available-height)] w-[18.5rem] overflow-y-auto p-3"
        collisionPadding={12}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

/** Remembers a paint's colors as recent when the picker closes changed. */
function useRecentOnClose(value: ColorConfig | undefined) {
  const opened = useRef<string | null>(null);
  return (open: boolean) => {
    const now = JSON.stringify(value ?? null);
    if (open) {
      opened.current = now;
    } else if (opened.current !== null && opened.current !== now) {
      addRecent(paintColors(value));
      opened.current = null;
    }
  };
}

const Trigger = forwardRef<
  HTMLButtonElement,
  {
    label: string;
    background: string;
    summary: string;
    disabled?: boolean;
    id?: string;
  }
>(function Trigger({ label, background, summary, disabled, ...props }, ref) {
  return (
    <button
      aria-label={`${label}: ${summary}`}
      className="group focus-visible:ring-ring/50 flex w-full min-w-0 items-center gap-2 rounded-full text-left outline-none focus-visible:ring-[3px] disabled:opacity-50"
      disabled={disabled}
      ref={ref}
      type="button"
      {...props}
    >
      <SwatchDot background={background} className="size-9 border shadow-xs" />
      <span className="border-input dark:bg-input/30 group-hover:bg-accent/40 flex h-9 min-w-0 flex-1 items-center rounded-md border px-3 font-mono text-xs shadow-xs transition-colors">
        <span className="truncate">{summary}</span>
      </span>
    </button>
  );
});

interface GradientPickerProps {
  /** The color control's id (focus, highlight and the contrast readout) */
  name: FocusColorId;
  value: ColorConfig | undefined;
  onChange: (value: ColorConfig) => void;
  label: string;
  /** Fill types offered (default: solid, linear, radial and angular) */
  kinds?: PaintKind[];
  /** Opacity controls (default true) */
  alpha?: boolean;
}

/**
 * The editor's color control: a swatch and a summary that open the paint
 * picker (solid, linear, radial and angular fills, opacity, color models,
 * eyedropper, swatches and the QR contrast check). Props are unchanged from
 * the earlier solid/gradient picker; `kinds` and `alpha` are optional.
 */
export function GradientPicker({
  name,
  value,
  onChange,
  label,
  kinds = QR_PAINT_KINDS,
  alpha = true,
}: GradientPickerProps) {
  const [open, setOpen] = useState(false);
  const recentOnClose = useRecentOnClose(value);
  const fallback = name === "bgColor" ? "#ffffff" : "#000000";

  const [shouldAnimate, setShouldAnimate] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const animationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const sectionCtx = useContext(SectionContext);
  const { registerColor, unregisterColor, highlightTarget } =
    useColorControlFocus();

  useEffect(() => {
    if (!name) return;
    registerColor(name, rootRef.current);
    return () => unregisterColor(name);
  }, [name, registerColor, unregisterColor]);

  const isHighlighted = name && highlightTarget === name;

  useEffect(() => {
    if (animationTimerRef.current) {
      clearTimeout(animationTimerRef.current);
      animationTimerRef.current = null;
    }
    if (isHighlighted) {
      setShouldAnimate(true);
      sectionCtx?.setIsExpanded(true);
      setTimeout(
        () => {
          rootRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        },
        sectionCtx?.isExpanded ? 0 : 100,
      );
      animationTimerRef.current = setTimeout(() => {
        setShouldAnimate(false);
        animationTimerRef.current = null;
      }, 1500);
    } else {
      setShouldAnimate(false);
    }
    return () => {
      if (animationTimerRef.current) {
        clearTimeout(animationTimerRef.current);
        animationTimerRef.current = null;
      }
    };
  }, [isHighlighted, sectionCtx]);

  return (
    <div
      className={cn(
        "min-w-0 transition-all duration-300",
        shouldAnimate &&
          "bg-border/50 ring-primary -m-1.5 mb-1.5 rounded-sm p-1.5 ring-2",
      )}
      ref={rootRef}
    >
      <div className="mb-1.5 flex items-center justify-between">
        <Label className="text-xs font-medium">{label}</Label>
      </div>
      <PaintPopover
        label={label}
        onOpenChange={(next) => {
          setOpen(next);
          recentOnClose(next);
        }}
        open={open}
        trigger={
          <Trigger
            background={paintBackground(value, fallback)}
            label={label}
            summary={paintSummary(value, fallback)}
          />
        }
      >
        <PaintPanel
          alpha={alpha}
          fallback={fallback}
          kinds={kinds}
          onChange={onChange}
          role={roleOf(name)}
          value={value}
        />
      </PaintPopover>
    </div>
  );
}

interface SolidColorFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
  /** Opacity controls (default false: these colors are stored as #rrggbb) */
  alpha?: boolean;
  /** Part of the QR design (default): its colors show as swatches */
  design?: boolean;
  className?: string;
}

/**
 * A solid color control with the same picker (no gradients): frame colors,
 * the logo's plate, landing page theme colors. Emits "#rrggbb" (or
 * "#rrggbbaa" with `alpha`).
 */
export function SolidColorField({
  id,
  label,
  value,
  onChange,
  disabled,
  alpha = false,
  design = true,
  className,
}: SolidColorFieldProps) {
  const [open, setOpen] = useState(false);
  const recentOnClose = useRecentOnClose(value);
  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      <Label className="text-xs" htmlFor={id}>
        {label}
      </Label>
      <PaintPopover
        label={label}
        onOpenChange={(next) => {
          setOpen(next);
          recentOnClose(next);
        }}
        open={open}
        trigger={
          <Trigger
            background={value}
            disabled={disabled}
            id={id}
            label={label}
            summary={paintSummary(value, "#000000")}
          />
        }
      >
        <PaintPanel
          alpha={alpha}
          design={design}
          onChange={(next) => {
            const color =
              typeof next === "string"
                ? next
                : next.type === "solid"
                  ? next.color
                  : null;
            if (color) onChange(color);
          }}
          value={value}
        />
      </PaintPopover>
    </div>
  );
}
