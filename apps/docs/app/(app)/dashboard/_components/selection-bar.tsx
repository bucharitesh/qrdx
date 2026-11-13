"use client";

// The bulk-actions bar the dashboard lists share (codes, barcodes, pages,
// form responses). Hidden until a row is selected, then it rises from the
// bottom of the screen, centred on the page beside the sidebar, and sinks
// away when the selection clears. It holds the count, Clear (Esc) and the
// list's actions; the ones that don't fit move into More, lesser first
// (_lib/selection-bar.ts). The keys stay in list-selection.tsx, so they work
// the same whether an action is a button or in the menu.
//
// Layers: z-30, over the page (its sticky headers are z-10/z-20) and under
// the top bar (z-40), menus, popovers and dialogs (z-50) and toasts. While
// it's open, the app frame's <main> gets room underneath it
// (components/app-shell/app-frame.tsx), so the last row and the pager can
// scroll clear of it.

import { Close } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import { cn } from "@repo/design-system/lib/utils";
import { More } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import {
  type FocusEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  ListShortcuts,
  SelectionStatus,
  type ShortcutRow,
} from "@/app/(app)/dashboard/_components/list-selection";
import { fitActions, sameIds } from "@/app/(app)/dashboard/_lib/selection-bar";
import { TooltipWrapper } from "@/components/tooltip-wrapper";

/** Marks the bar's wrapper; app-frame.tsx makes room under an open bar. */
export const SELECTION_BAR_ATTR = "data-selection-bar";

export interface SelectionBarAction {
  id: string;
  /** The button's text */
  label: string;
  /** The tooltip, and the text in More (default: `label`) */
  title?: string;
  icon: ReactNode;
  /** Its bulk key as it reads, e.g. "M" or "⌫" (list-keys.ts) */
  kbd?: string;
  /** Higher stays a button longer when the bar runs out of room (default 0) */
  priority?: number;
  /** Shown in the destructive colour, and last in More */
  destructive?: boolean;
  disabled?: boolean;
  /** What a click does */
  onSelect?: () => void;
  /** Or a menu of DropdownMenuItems (formats, folders) instead */
  menu?: ReactNode;
  menuClassName?: string;
}

interface Shown {
  countLabel: string;
  actions: SelectionBarAction[];
}

const px = (value: string) => Number.parseFloat(value) || 0;
const widthOf = (element: Element | null) =>
  element?.getBoundingClientRect().width ?? 0;

function ActionButton({
  action,
  disabled,
  shortcutsOn,
}: {
  action: SelectionBarAction;
  disabled: boolean;
  shortcutsOn: boolean;
}) {
  const button = (
    <Button
      className={cn(
        action.destructive &&
          "text-destructive hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20",
      )}
      disabled={disabled || action.disabled}
      onClick={action.menu ? undefined : action.onSelect}
      size="sm"
      variant="ghost"
    >
      {action.icon}
      {action.label}
    </Button>
  );
  if (action.menu) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{button}</DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className={action.menuClassName}
          side="top"
        >
          {action.menu}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
  if (!(action.title || (action.kbd && shortcutsOn))) return button;
  return (
    <TooltipWrapper
      kbd={action.kbd}
      label={action.title ?? action.label}
      side="top"
    >
      {button}
    </TooltipWrapper>
  );
}

function MenuEntry({
  action,
  disabled,
  shortcutsOn,
}: {
  action: SelectionBarAction;
  disabled: boolean;
  shortcutsOn: boolean;
}) {
  const text = action.title ?? action.label;
  if (action.menu) {
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger disabled={disabled || action.disabled}>
          {action.icon}
          {text}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className={action.menuClassName}>
          {action.menu}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    );
  }
  return (
    <DropdownMenuItem
      disabled={disabled || action.disabled}
      onSelect={action.onSelect}
      variant={action.destructive ? "destructive" : "default"}
    >
      {action.icon}
      {text}
      {shortcutsOn && action.kbd && (
        <DropdownMenuShortcut>{action.kbd}</DropdownMenuShortcut>
      )}
    </DropdownMenuItem>
  );
}

export function SelectionBar({
  count,
  noun,
  label,
  countLabel,
  clearLabel,
  onClear,
  actions,
  disabled = false,
  shortcuts,
}: {
  count: number;
  /** For the screen-reader announcement: singular and plural */
  noun: [string, string];
  /** The toolbar's name, e.g. "Bulk actions" */
  label: string;
  /** "3 selected" */
  countLabel: string;
  clearLabel: string;
  onClear: () => void;
  /** The list's actions, in order; leave out what the role or view lacks */
  actions: SelectionBarAction[];
  /** Every action off, while one runs */
  disabled?: boolean;
  /** The keys popover's list's actions; leave out when keys are off */
  shortcuts?: ShortcutRow[];
}) {
  const t = useTranslations("app.dashboard.listSelection");
  const open = count > 0;
  const shortcutsOn = shortcuts !== undefined;

  // While it sinks away the selection is already empty: keep showing what
  // it held (inert by then, so nothing in it can run).
  const last = useRef<Shown>({ countLabel, actions });
  if (open) last.current = { countLabel, actions };
  const shown = last.current;

  // Which actions are buttons; null until measured (all of them).
  const [inBar, setInBar] = useState<ReadonlySet<string> | null>(null);
  const roomRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const shownRef = useRef(shown);
  shownRef.current = shown;

  const refit = useCallback(() => {
    const room = roomRef.current;
    const bar = barRef.current;
    const measure = measureRef.current;
    if (!(room && bar && measure)) return;
    const barStyle = getComputedStyle(bar);
    const chrome =
      px(barStyle.paddingLeft) +
      px(barStyle.paddingRight) +
      px(barStyle.borderLeftWidth) +
      px(barStyle.borderRightWidth);
    const widths = new Map(
      [...measure.querySelectorAll("[data-measure-action]")].map((element) => [
        element.getAttribute("data-measure-action"),
        widthOf(element),
      ]),
    );
    const next = fitActions({
      available: room.clientWidth - chrome,
      fixed: [...measure.querySelectorAll("[data-measure='fixed']")].map(
        widthOf,
      ),
      more: widthOf(measure.querySelector("[data-measure='more']")),
      gap: px(getComputedStyle(measure).columnGap),
      actions: shownRef.current.actions.map((action) => ({
        id: action.id,
        priority: action.priority ?? 0,
        width: widths.get(action.id) ?? 0,
      })),
    });
    setInBar((current) => (current && sameIds(current, next) ? current : next));
  }, []);

  // Again whenever the room or the measured row changes size (the sidebar
  // folds, the window turns, a font arrives).
  useEffect(() => {
    const room = roomRef.current;
    const measure = measureRef.current;
    if (!(room && measure) || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(refit);
    observer.observe(room);
    observer.observe(measure);
    return () => observer.disconnect();
  }, [refit]);

  // And before painting new labels (the count, Pause or Resume).
  const signature = [
    shown.countLabel,
    shortcutsOn,
    ...shown.actions.map(
      (action) => `${action.id}:${action.label}:${action.title ?? ""}`,
    ),
  ].join("\n");
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-fits when the labels change
  useLayoutEffect(() => refit(), [refit, signature]);

  // Closing with focus inside (Clear, or Esc on a button): hand focus back to
  // where it came from rather than losing it to the page.
  const cameFrom = useRef<HTMLElement | null>(null);
  const onFocus = (event: FocusEvent<HTMLDivElement>) => {
    const from = event.relatedTarget;
    if (from instanceof HTMLElement && !event.currentTarget.contains(from)) {
      cameFrom.current = from;
    }
  };
  useLayoutEffect(() => {
    if (open) return;
    const bar = barRef.current;
    if (!bar?.contains(document.activeElement)) return;
    const back = cameFrom.current;
    if (back?.isConnected) back.focus({ preventScroll: true });
    else (document.activeElement as HTMLElement | null)?.blur();
  }, [open]);

  const buttons = shown.actions.filter(
    (action) => !inBar || inBar.has(action.id),
  );
  const overflow = shown.actions.filter(
    (action) => inBar && !inBar.has(action.id),
  );
  const overflowPlain = overflow.filter((action) => !action.destructive);
  const overflowDestructive = overflow.filter((action) => action.destructive);

  const divider = (
    <div aria-hidden className="flex h-8 w-2.25 shrink-0 justify-center">
      <div className="bg-border my-auto h-5 w-px" />
    </div>
  );

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-0 z-30 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]",
        "md:left-(--app-sidebar-width,0px) md:px-8 md:pb-[calc(env(safe-area-inset-bottom)+1.5rem)]",
        "transition-[left] duration-200 ease-out motion-reduce:transition-none",
      )}
      {...{ [SELECTION_BAR_ATTR]: open ? "open" : "closed" }}
    >
      {/* Inside the fixed layer: an sr-only line at the end of a long list
            would otherwise stretch the page below the frame. */}
      <SelectionStatus count={count} noun={noun} />
      <div
        className="relative mx-auto flex w-full max-w-6xl justify-center"
        ref={roomRef}
      >
        <div
          aria-label={label}
          className={cn(
            "bg-popover/95 text-popover-foreground supports-backdrop-filter:bg-popover/80 flex w-full max-w-full items-center gap-1 rounded-xl border p-1.5 shadow-lg backdrop-blur-md sm:w-auto dark:shadow-black/40",
            "transition-[translate,opacity,visibility] duration-200 ease-out motion-reduce:transition-none",
            open
              ? "pointer-events-auto visible translate-y-0 opacity-100"
              : "invisible translate-y-[calc(100%+2rem)] opacity-0",
          )}
          inert={!open}
          onFocus={onFocus}
          ref={barRef}
          role="toolbar"
        >
          <span className="shrink-0 px-2 text-sm font-medium whitespace-nowrap tabular-nums">
            {shown.countLabel}
          </span>
          <TooltipWrapper kbd="Esc" label={clearLabel} side="top">
            <Button
              aria-label={clearLabel}
              onClick={onClear}
              size="icon-sm"
              variant="ghost"
            >
              <Close />
            </Button>
          </TooltipWrapper>
          {shown.actions.length > 0 && divider}
          {buttons.map((action) => (
            <ActionButton
              action={action}
              disabled={disabled}
              key={action.id}
              shortcutsOn={shortcutsOn}
            />
          ))}
          {overflow.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label={t("moreActions")}
                  disabled={disabled}
                  size="sm"
                  variant="ghost"
                >
                  <More />
                  {t("more")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56" side="top">
                {overflowPlain.map((action) => (
                  <MenuEntry
                    action={action}
                    disabled={disabled}
                    key={action.id}
                    shortcutsOn={shortcutsOn}
                  />
                ))}
                {overflowPlain.length > 0 && overflowDestructive.length > 0 && (
                  <DropdownMenuSeparator />
                )}
                {overflowDestructive.map((action) => (
                  <MenuEntry
                    action={action}
                    disabled={disabled}
                    key={action.id}
                    shortcutsOn={shortcutsOn}
                  />
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {shortcuts && (
            <div className="ml-auto">
              <ListShortcuts actions={shortcuts} />
            </div>
          )}
        </div>

        {/* The same row, unseen, to measure what fits. */}
        <div
          aria-hidden
          className="pointer-events-none invisible absolute top-0 left-0 flex w-max items-center gap-1"
          inert
          ref={measureRef}
        >
          <span
            className="shrink-0 px-2 text-sm font-medium whitespace-nowrap tabular-nums"
            data-measure="fixed"
          >
            {shown.countLabel}
          </span>
          <Button
            data-measure="fixed"
            size="icon-sm"
            tabIndex={-1}
            variant="ghost"
          >
            <Close />
          </Button>
          {shown.actions.length > 0 && (
            <div className="w-2.25 shrink-0" data-measure="fixed" />
          )}
          {shown.actions.map((action) => (
            <Button
              data-measure-action={action.id}
              key={action.id}
              size="sm"
              tabIndex={-1}
              variant="ghost"
            >
              {action.icon}
              {action.label}
            </Button>
          ))}
          <Button data-measure="more" size="sm" tabIndex={-1} variant="ghost">
            <More />
            {t("more")}
          </Button>
          {shortcuts && (
            <Button
              className="max-sm:hidden"
              data-measure="fixed"
              size="icon-sm"
              tabIndex={-1}
              variant="ghost"
            />
          )}
        </div>
      </div>
    </div>
  );
}
