"use client";

import { Setting4, Shuffle } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import {
  type KeyboardEvent,
  type ReactNode,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  Divider,
  inlineMenuSelector,
  insideInlineEditor,
  MenuPopover,
  moveAlongToolbar,
  ToolbarButton,
  toolbarClass,
} from "../frame-inline/inline-toolbar";
import { placeMenu } from "../frame-inline/menu-placement";
import type { Box } from "../frame-inline/preview-labels";
import type { PartItem } from "./part-controls";
import { type PartId, toolbarAnchor } from "./part-targets";

/** Room between a part and the outline drawn around it while it's edited. */
export const OUTLINE_PAD = 3;

export interface PartToolbarProps {
  part: PartId;
  items: PartItem[];
  /** Rendered with the toolbar, outside its menus (a file input) */
  extra?: ReactNode;
  /** Where the part is drawn: the toolbar floats beside it */
  anchor: Box;
  /** The outlines around the part while it's edited */
  outlines: Box[];
  /** The outline's color (contrasts with what's under it) */
  outlineColor: string;
  /** Where the whole artwork is drawn: the toolbar stays off it when there's room */
  artwork: Box | null;
  /** The preview container's size, to keep the toolbar inside it */
  bounds: { width: number; height: number };
  onRandom: () => void;
  onMoreOptions: () => void;
  /** Enter */
  onCommit: () => void;
  /** Focus left the editor (Tab past the toolbar) */
  onLeave: () => void;
  onCancel: () => void;
}

/**
 * The toolbar of one part of the code (eyes, dots, logo, background or
 * frame), floating beside it with an outline around the part. Every menu
 * opens away from the code, so the change stays in view.
 */
export function PartToolbar({
  part,
  items,
  extra,
  anchor,
  outlines,
  outlineColor,
  artwork,
  bounds,
  onRandom,
  onMoreOptions,
  onCommit,
  onLeave,
  onCancel,
}: PartToolbarProps) {
  const t = useTranslations("editor.partInline");
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  // Focus the first button once the toolbar shows (it is hidden, and so
  // can't take focus, until it has been measured and placed)
  const focused = useRef(false);
  useLayoutEffect(() => {
    if (focused.current || size.width === 0) return;
    focused.current = true;
    toolbarRef.current
      ?.querySelector<HTMLButtonElement>("button")
      ?.focus({ preventScroll: true });
  }, [size.width]);

  useLayoutEffect(() => {
    const node = toolbarRef.current;
    if (!node) return;
    const { width, height } = node.getBoundingClientRect();
    setSize((current) =>
      current.width === width && current.height === height
        ? current
        : { width, height },
    );
  });

  // Placed once it has a size, then kept for the whole edit (until the
  // preview resizes): Random can redraw the part, a frame at another size,
  // and pressing it again must find the button where it was.
  const pinned = useRef<{
    placed: ReturnType<typeof placeMenu>;
    width: number;
    height: number;
  } | null>(null);
  const fresh = placeMenu(
    size,
    toolbarAnchor(anchor, artwork),
    artwork,
    bounds,
  );
  if (
    size.width > 0 &&
    (pinned.current?.width !== bounds.width ||
      pinned.current?.height !== bounds.height)
  ) {
    pinned.current = { placed: fresh, ...bounds };
  }
  const placed = pinned.current?.placed ?? fresh;
  // Menus open away from the code, so the part stays in view
  const side = placed.above ? "top" : "bottom";

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as Element;
    // An open menu handles its own keys (Radix closes it on Escape)
    if (target.closest(inlineMenuSelector("part"))) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
      return;
    }
    // Enter on a button presses it; anywhere else it keeps the edit
    if (event.key === "Enter" && !target.closest("button, input")) {
      event.preventDefault();
      onCommit();
    }
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Escape anywhere in the editor cancels it
    <div
      className="absolute inset-0 z-20"
      data-inline-editor=""
      data-part-inline=""
      data-state="open"
      onBlur={(event) => {
        const next = event.relatedTarget as Element | null;
        if (!next) return;
        if (event.currentTarget.contains(next)) return;
        if (insideInlineEditor(next, "part")) return;
        onLeave();
      }}
      onKeyDown={onKeyDown}
      style={{ pointerEvents: "none" }}
    >
      {outlines.map((box, index) => (
        <span
          aria-hidden
          className="pointer-events-none absolute rounded-[5px] ring-1 ring-current/50"
          key={index}
          style={{
            color: outlineColor,
            left: box.left - OUTLINE_PAD,
            top: box.top - OUTLINE_PAD,
            width: box.width + 2 * OUTLINE_PAD,
            height: box.height + 2 * OUTLINE_PAD,
          }}
        />
      ))}

      <div
        aria-label={t(`parts.${part}.options`)}
        aria-orientation="horizontal"
        className={toolbarClass}
        data-part-toolbar={part}
        onKeyDown={moveAlongToolbar}
        ref={toolbarRef}
        role="toolbar"
        style={{
          left: placed.left,
          top: placed.top,
          visibility: size.width ? "visible" : "hidden",
        }}
      >
        {items.map((item) =>
          item.kind === "menu" ? (
            <MenuPopover
              className={item.className}
              key={item.id}
              kind="part"
              label={item.label}
              menu={item.id}
              onOpenChange={setMenu}
              open={menu === item.id}
              side={side}
              trigger={item.trigger}
            >
              {item.content}
            </MenuPopover>
          ) : item.kind === "segment" ? (
            // biome-ignore lint/a11y/useSemanticElements: a two-way switch of toggle buttons
            <div
              aria-label={item.label}
              className="bg-muted/60 flex items-center rounded-full p-0.5"
              key={item.id}
              role="group"
            >
              {item.options.map((option) => (
                <button
                  aria-pressed={item.value === option.id}
                  className="aria-pressed:bg-background aria-pressed:text-foreground text-muted-foreground focus-visible:ring-ring/50 h-6 rounded-full px-2 text-xs font-medium outline-none focus-visible:ring-[3px] aria-pressed:shadow-xs"
                  key={option.id}
                  onClick={() => item.onChange(option.id)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : (
            <ToolbarButton
              key={item.id}
              label={item.label}
              onClick={item.onToggle}
              pressed={item.pressed}
            >
              {item.trigger}
            </ToolbarButton>
          ),
        )}

        <Divider />

        <ToolbarButton label={t(`parts.${part}.random`)} onClick={onRandom}>
          <Shuffle aria-hidden className="size-4" />
          <span>{t("random")}</span>
        </ToolbarButton>

        <Divider />

        <ToolbarButton label={t(`parts.${part}.more`)} onClick={onMoreOptions}>
          <Setting4 aria-hidden className="size-4" />
        </ToolbarButton>
      </div>
      {extra}
    </div>
  );
}
