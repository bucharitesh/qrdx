"use client";

// The builders' dialog, shared by the dynamic code builder and the
// new-barcode modal: a header with the title and Close, the form beside a
// preview column (one column on phones, where it is a drawer), and a footer
// for the actions. Closing and Esc go through the builder, so a form with
// unsaved changes can ask first.

import { Close } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { Kbd } from "@repo/design-system/components/ui/kbd";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogTitle,
} from "@repo/design-system/components/ui/revola";
import { cn } from "@repo/design-system/lib/utils";
import { type ReactNode, type RefObject, useEffect, useRef } from "react";
import {
  type BuilderShortcut,
  resolveBuilderShortcut,
  type ShortcutContext,
  submitKeyLabel,
} from "./shortcuts";

export function BuilderShell({
  open,
  onRequestClose,
  onEscape,
  contentRef,
  title,
  description,
  headerActions,
  closeLabel,
  top,
  aside,
  footerStart,
  footerEnd,
  footerHidden,
  children,
}: {
  open: boolean;
  /** Close, a click outside or a swipe down: the builder decides */
  onRequestClose: () => void;
  onEscape: () => void;
  contentRef: RefObject<HTMLDivElement | null>;
  title: ReactNode;
  description: ReactNode;
  /** Beside Close (the code builder's drafts) */
  headerActions?: ReactNode;
  closeLabel: string;
  /** Above the form (phones: the compact preview) */
  top?: ReactNode;
  /** The preview column beside the form; none = the form alone */
  aside?: ReactNode;
  /** The footer's left side (the code builder's options) */
  footerStart?: ReactNode;
  /** The footer's buttons */
  footerEnd?: ReactNode;
  footerHidden?: boolean;
  /** The form, or what replaces it */
  children: ReactNode;
}) {
  return (
    <ResponsiveDialog
      onOpenChange={(next) => {
        if (!next) onRequestClose();
      }}
      open={open}
    >
      <ResponsiveDialogContent
        className="flex flex-col gap-0 overflow-hidden p-0 max-sm:max-h-[92svh] sm:max-w-5xl"
        onEscapeKeyDown={(event) => {
          event.preventDefault();
          onEscape();
        }}
        ref={contentRef}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <ResponsiveDialogTitle className="truncate text-base">
              {title}
            </ResponsiveDialogTitle>
            <ResponsiveDialogDescription className="truncate text-xs max-sm:sr-only">
              {description}
            </ResponsiveDialogDescription>
          </div>
          {headerActions}
          <Button
            aria-label={closeLabel}
            className="size-8 shrink-0"
            onClick={onRequestClose}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Close className="size-4" />
          </Button>
        </div>

        {/* Body */}
        <div
          className={cn(
            "grid min-h-0 flex-1",
            aside &&
              "md:h-[min(38rem,calc(100dvh-12rem))] md:grid-cols-[minmax(0,1fr)_21rem]",
          )}
        >
          <div className="min-h-0 overflow-y-auto px-4 py-4 sm:px-5">
            {top && <div className="mb-4">{top}</div>}
            {children}
          </div>
          {aside && (
            <div className="bg-muted/20 flex min-h-0 flex-col border-l">
              {aside}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className={cn(
            "bg-muted/30 flex flex-col gap-3 border-t px-4 py-3 sm:px-5 md:flex-row md:items-center",
            footerHidden && "hidden",
          )}
        >
          <div className="min-w-0 flex-1">{footerStart}</div>
          <div className="flex shrink-0 items-center justify-end gap-2">
            {footerEnd}
          </div>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

/** ⌘↵ (Ctrl ↵) on the submit button, from md up. */
export function BuilderSubmitKey() {
  return (
    <Kbd
      aria-hidden
      className="bg-primary-foreground/15 text-primary-foreground ml-1 hidden md:inline-flex"
    >
      {submitKeyLabel(
        typeof navigator === "undefined" ? "" : navigator.userAgent,
      )}
    </Kbd>
  );
}

/**
 * The builder's keys while it's open (shortcuts.ts says what each does).
 * Only keys meant for the builder: not for a menu or popover above it.
 */
export function useBuilderShortcuts({
  enabled,
  contentRef,
  context,
  onAction,
}: {
  enabled: boolean;
  contentRef: RefObject<HTMLDivElement | null>;
  context: ShortcutContext;
  onAction: (action: BuilderShortcut) => void;
}) {
  // The latest state and handlers, without listening again on every render.
  const latest = useRef({ context, onAction });
  latest.current = { context, onAction };

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const content = contentRef.current;
      const element = event.target instanceof HTMLElement ? event.target : null;
      if (
        !content ||
        !(element === document.body || (element && content.contains(element)))
      ) {
        return;
      }
      const action = resolveBuilderShortcut(
        {
          key: event.key,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
          isComposing: event.isComposing,
          target: element
            ? {
                tagName: element.tagName,
                isContentEditable: element.isContentEditable,
                role: element.getAttribute("role"),
              }
            : null,
        },
        latest.current.context,
      );
      if (!action) return;
      event.preventDefault();
      latest.current.onAction(action);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [enabled, contentRef]);
}
