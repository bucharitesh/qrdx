"use client";

import { cn } from "@repo/design-system/lib/utils";
import { useTranslations } from "next-intl";
import { LOGO_SIZE_MIN, type LogoOptions } from "qrdx/types";
import { type KeyboardEvent, type PointerEvent, useId, useRef } from "react";
import type { Box } from "../frame-inline/preview-labels";
import {
  marginFromDrag,
  movedLogo,
  nudgedLogo,
  resizedLogo,
  steppedLogoSize,
  steppedMargin,
} from "./drag-math";

// Handles the preview shows while a part is edited: drag the logo to move
// it, its corner to resize it (arrow keys too), and the code's edge to
// change the quiet zone. They belong to the open edit (data-part-inline), so
// using them never ends it, and every change is a draft like the toolbar's.
// Pointer events, so touch works the same as a mouse.

const handle =
  "bg-background border-foreground/60 pointer-events-auto absolute border shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-current/70 touch-none";

/** Follows one pointer from press to release (captured, so it never strays). */
function useDrag<T>(
  onStart: () => T,
  onMove: (start: T, delta: { dx: number; dy: number }) => void,
) {
  const drag = useRef<{ id: number; x: number; y: number; start: T } | null>(
    null,
  );
  return {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.focus({ preventScroll: true });
      drag.current = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        start: onStart(),
      };
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const current = drag.current;
      if (!current || current.id !== event.pointerId) return;
      onMove(current.start, {
        dx: event.clientX - current.x,
        dy: event.clientY - current.y,
      });
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      if (drag.current?.id !== event.pointerId) return;
      drag.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    },
    onPointerCancel: () => {
      drag.current = null;
    },
  };
}

/**
 * The logo while it's edited: drag it to move it across the code, drag its
 * corner to resize it. Arrow keys move it (Shift for bigger steps); on the
 * corner they resize it. Delete or Backspace hides it.
 */
export function LogoHandles({
  logo,
  symbol,
  code,
  size,
  maxSize,
  color,
  onOptions,
  onHide,
  onCancel,
}: {
  /** Where the logo is drawn */
  logo: Box;
  /** The symbol (x and y are shares across it) */
  symbol: Box;
  /** The whole code (size is a share of its width) */
  code: Box;
  /** logoOptions.size as drawn */
  size: number;
  /** The biggest the code can repair (a share, at most LOGO_SIZE_MAX) */
  maxSize: number;
  /** The outline and handle color (contrasts with the code under it) */
  color: string;
  onOptions: (change: Partial<LogoOptions>) => void;
  onHide: () => void;
  /** Escape: the edit is put back */
  onCancel: () => void;
}) {
  const t = useTranslations("editor.partInline.handles");
  const hintId = useId();

  const move = useDrag(
    () => ({ logo, symbol }),
    (start, delta) => onOptions(movedLogo(delta, start)),
  );
  const resize = useDrag(
    () => ({ logo, code }),
    (start, delta) => onOptions({ size: resizedLogo(delta, start, maxSize) }),
  );

  const onMoveKey = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      onHide();
      return;
    }
    const next = nudgedLogo(event.key, event.shiftKey, { logo, symbol });
    if (!next) return;
    event.preventDefault();
    event.stopPropagation();
    onOptions(next);
  };

  const onSizeKey = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    const next = steppedLogoSize(event.key, event.shiftKey, size, maxSize);
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    onOptions({ size: next });
  };

  const corner = 12;
  return (
    <div
      className="pointer-events-none absolute inset-0 z-20"
      data-part-inline=""
      style={{ color }}
    >
      <span className="sr-only" id={hintId}>
        {t("dragOrUseTheArrowKeys")}
      </span>
      <button
        aria-describedby={hintId}
        aria-label={t("moveLogo")}
        className={cn(
          "pointer-events-auto absolute cursor-move rounded-[5px] outline-none touch-none",
          "ring-1 ring-current/50 focus-visible:ring-2 focus-visible:ring-current/70",
        )}
        data-logo-move=""
        onKeyDown={onMoveKey}
        style={{
          left: logo.left,
          top: logo.top,
          width: logo.width,
          height: logo.height,
        }}
        type="button"
        {...move}
      />
      <div
        aria-label={t("logoSize")}
        aria-valuemax={Math.round(maxSize * 100)}
        aria-valuemin={Math.round(LOGO_SIZE_MIN * 100)}
        aria-valuenow={Math.round(size * 100)}
        aria-valuetext={t("percentOfTheCode", {
          value: Math.round(size * 100),
        })}
        className={cn(handle, "cursor-nwse-resize rounded-[3px]")}
        data-logo-resize=""
        onKeyDown={onSizeKey}
        role="slider"
        style={{
          left: logo.left + logo.width - corner / 2,
          top: logo.top + logo.height - corner / 2,
          width: corner,
          height: corner,
        }}
        tabIndex={0}
        {...resize}
      />
    </div>
  );
}

/**
 * The quiet zone while the background is edited: a handle on the code's
 * right edge. Drag it in for more padding, out for less (whole modules, the
 * padding control's range); arrow keys step it.
 */
export function PaddingHandle({
  code,
  modulePx,
  margin,
  max,
  onMargin,
  onCancel,
}: {
  /** The whole code, quiet zone included */
  code: Box;
  /** One module's width when the drag starts */
  modulePx: number;
  margin: number;
  max: number;
  onMargin: (margin: number) => void;
  /** Escape: the edit is put back */
  onCancel: () => void;
}) {
  const t = useTranslations("editor.partInline.handles");
  const drag = useDrag(
    () => ({ margin, modulePx }),
    (start, delta) =>
      // The handle is on the right edge: dragging left is inward
      onMargin(marginFromDrag(start.margin, -delta.dx, start.modulePx, max)),
  );
  const width = 8;
  const height = 32;
  return (
    <div
      className="pointer-events-none absolute inset-0 z-20"
      data-part-inline=""
    >
      <div
        aria-label={t("padding")}
        aria-valuemax={max}
        aria-valuemin={0}
        aria-valuenow={margin}
        aria-valuetext={t("modules", { count: margin })}
        className={cn(handle, "text-foreground cursor-ew-resize rounded-full")}
        data-padding-handle=""
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
            return;
          }
          const next = steppedMargin(event.key, margin, max);
          if (next === null) return;
          event.preventDefault();
          event.stopPropagation();
          onMargin(next);
        }}
        role="slider"
        style={{
          left: code.left + code.width - width / 2,
          top: code.top + code.height / 2 - height / 2,
          width,
          height,
        }}
        tabIndex={0}
        title={t("dragToChangeThePadding")}
        {...drag}
      />
    </div>
  );
}
