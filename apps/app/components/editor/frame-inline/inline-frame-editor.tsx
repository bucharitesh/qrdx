"use client";

import { cn } from "@repo/design-system/lib/utils";
import {
  Paintbucket,
  Setting4,
  Shapes,
  Smallcaps,
  Text as TextIcon,
} from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { FRAME_FONT_FAMILY } from "qrdx";
import {
  type CSSProperties,
  type KeyboardEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { TooltipWrapper } from "@/components/tooltip-wrapper";
import { FrameTextSize } from "../control-sections/frame-fields";
import {
  charactersLeft,
  type FrameTextTarget,
  type FrameTweak,
  type FrameTweaks,
  nearTextLimit,
} from "./frame-text-fields";
import {
  ColorEditor,
  ContrastNote,
  IconsEditor,
  labelContrast,
} from "./frame-text-menu";
import {
  Divider,
  inlineMenuSelector,
  insideInlineEditor,
  MenuPopover,
  menuButton,
  moveAlongToolbar,
  Swatch,
  toolbarClass,
} from "./inline-toolbar";
import { placeMenu } from "./menu-placement";
import type { Box, PreviewLabel } from "./preview-labels";

type Menu = "size" | "text-color" | "frame-color" | "icon";

const TEXT_ALIGN = { start: "left", middle: "center", end: "right" } as const;

export interface InlineFrameEditorProps {
  label: PreviewLabel;
  target: FrameTextTarget;
  text: string;
  tweaks: FrameTweaks;
  /** The preview container's size, to keep the menu inside it */
  bounds: { width: number; height: number };
  /** Where the whole frame is drawn: the menu stays off it when there's room */
  artwork: Box | null;
  onText: (text: string) => void;
  onTweak: (tweak: FrameTweak) => void;
  /** Enter */
  onCommit: () => void;
  /** Focus left the editor (Tab past the menu) */
  onLeave: () => void;
  onCancel: () => void;
  onMoreOptions: () => void;
}

/** Where the input goes: over the label's row, or a field on curved text. */
function inputBox(label: PreviewLabel, artwork: Box | null): Box {
  if (label.curved || label.row.width <= 0) {
    // A plain field just inside the curve (toward the middle of the frame),
    // so the letters it edits stay in view as they redraw
    const width = Math.max(200, Math.min(280, label.box.width));
    const middle = artwork ? artwork.top + artwork.height / 2 : 0;
    const onTop = label.box.top + label.box.height / 2 < middle;
    return {
      left: label.box.left + label.box.width / 2 - width / 2,
      top: onTop
        ? label.box.top + label.box.height + 8
        : label.box.top - 8 - FIELD_HEIGHT,
      width,
      height: FIELD_HEIGHT,
    };
  }
  return {
    left: label.row.left,
    top: label.box.top,
    width: label.row.width,
    height: label.box.height,
  };
}

const FIELD_HEIGHT = 36;

const union = (a: Box, b: Box): Box => {
  const left = Math.min(a.left, b.left);
  const top = Math.min(a.top, b.top);
  return {
    left,
    top,
    width: Math.max(a.left + a.width, b.left + b.width) - left,
    height: Math.max(a.top + a.height, b.top + b.height) - top,
  };
};

/**
 * The input laid exactly over a frame label (same place, size, font and
 * color; the drawn text is hidden under it), with the menu floating beside
 * it. Curved text keeps its letters drawn and gets a plain field instead.
 */
export function InlineFrameEditor({
  label,
  target,
  text,
  tweaks,
  bounds,
  artwork,
  onText,
  onTweak,
  onCommit,
  onLeave,
  onCancel,
  onMoreOptions,
}: InlineFrameEditorProps) {
  const t = useTranslations("editor.frameInline.inlineFrameEditor");
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const counterId = useId();
  const [menu, setMenu] = useState<Menu | null>(null);
  const [menuSize, setMenuSize] = useState({ width: 0, height: 0 });
  const box = inputBox(label, artwork);
  const plain = label.curved || label.row.width <= 0;
  const left = charactersLeft(text, target.maxLength);
  const showLeft = nearTextLimit(text, target.maxLength);
  const contrast = labelContrast(label.fill, label.behind);

  // Focus with the text selected, once, when the editor opens
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus({ preventScroll: true });
    input.select();
  }, []);

  useLayoutEffect(() => {
    const node = menuRef.current;
    if (!node) return;
    const { width, height } = node.getBoundingClientRect();
    setMenuSize((size) =>
      size.width === width && size.height === height ? size : { width, height },
    );
  });

  // The menu clears the curved letters as well as the field
  const anchor = plain ? union(box, label.box) : label.box;
  const placed = placeMenu(menuSize, anchor, artwork, bounds);
  // Menus open away from the frame, so the text stays in view
  const menuSide = placed.above ? "top" : "bottom";

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape") return;
    // An open menu closes first (Radix handles its own Escape)
    if ((event.target as Element).closest(inlineMenuSelector("frame"))) return;
    event.preventDefault();
    event.stopPropagation();
    onCancel();
  };

  const inputStyle: CSSProperties = plain
    ? {}
    : {
        color: label.fill,
        caretColor: label.fill,
        fontFamily: FRAME_FONT_FAMILY,
        fontSize: label.fontSize,
        fontWeight: label.fontWeight,
        lineHeight: `${box.height}px`,
        textAlign: TEXT_ALIGN[label.align],
      };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Escape anywhere in the editor cancels it
    <div
      className="absolute inset-0 z-20"
      data-frame-inline=""
      data-inline-editor=""
      data-state="open"
      onBlur={(event) => {
        const next = event.relatedTarget as Element | null;
        if (!next) return;
        if (event.currentTarget.contains(next)) return;
        if (insideInlineEditor(next, "frame")) return;
        onLeave();
      }}
      onKeyDown={onKeyDown}
      style={{ pointerEvents: "none" }}
    >
      <input
        aria-describedby={showLeft ? counterId : undefined}
        aria-label={t("frameTextName", { name: target.name })}
        autoComplete="off"
        className={cn(
          "pointer-events-auto absolute m-0 border-0 p-0 outline-none",
          plain
            ? "bg-popover text-popover-foreground rounded-full border px-3 text-sm shadow-md"
            : "bg-transparent",
        )}
        enterKeyHint="done"
        onChange={(event) => onText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) {
            event.preventDefault();
            onCommit();
          }
        }}
        ref={inputRef}
        spellCheck={false}
        style={{
          left: box.left,
          top: box.top,
          width: box.width,
          height: box.height,
          ...inputStyle,
        }}
        type="text"
        value={text}
      />
      {!plain && (
        // A hairline around the text being edited, in its own color
        <span
          aria-hidden
          className="pointer-events-none absolute rounded-[5px] ring-1 ring-current/50"
          style={{
            color: label.fill,
            left: box.left - 4,
            top: box.top - 4,
            width: box.width + 8,
            height: box.height + 8,
          }}
        />
      )}

      <div
        aria-label={t("frameTextOptions")}
        aria-orientation="horizontal"
        className={toolbarClass}
        onKeyDown={moveAlongToolbar}
        ref={menuRef}
        role="toolbar"
        style={{
          left: placed.left,
          top: placed.top,
          visibility: menuSize.width ? "visible" : "hidden",
        }}
      >
        <MenuPopover
          kind="frame"
          label={t("textSize")}
          menu="size"
          onOpenChange={setMenu}
          side={menuSide}
          open={menu === "size"}
          trigger={
            <>
              <Smallcaps aria-hidden className="size-4" />
              <span>{Math.round(tweaks.fontScale * 100)}%</span>
            </>
          }
        >
          <FrameTextSize
            onChange={(value) => onTweak({ kind: "fontScale", value })}
            value={tweaks.fontScale}
          />
        </MenuPopover>

        {(tweaks.textColor || tweaks.frameColor) && <Divider />}

        {tweaks.textColor && (
          <MenuPopover
            kind="frame"
            label={t("textColor")}
            menu="text-color"
            onOpenChange={setMenu}
            side={menuSide}
            open={menu === "text-color"}
            trigger={
              <>
                <TextIcon aria-hidden className="size-4" />
                <Swatch color={tweaks.textColor} />
              </>
            }
          >
            <ColorEditor
              label={t("textColor")}
              onChange={(value) => onTweak({ kind: "textColor", value })}
              value={tweaks.textColor}
            />
            <ContrastNote ratio={contrast} />
          </MenuPopover>
        )}

        {tweaks.frameColor && (
          <MenuPopover
            kind="frame"
            label={t("frameColor")}
            menu="frame-color"
            onOpenChange={setMenu}
            side={menuSide}
            open={menu === "frame-color"}
            trigger={
              <>
                <Paintbucket aria-hidden className="size-4" />
                <Swatch color={tweaks.frameColor} />
              </>
            }
          >
            <ColorEditor
              label={t("frameColor")}
              onChange={(value) => onTweak({ kind: "frameColor", value })}
              value={tweaks.frameColor}
            />
            <ContrastNote ratio={contrast} />
          </MenuPopover>
        )}

        {tweaks.icons.length > 0 && (
          <MenuPopover
            kind="frame"
            className="w-80"
            label={t("icon")}
            menu="icon"
            onOpenChange={setMenu}
            side={menuSide}
            open={menu === "icon"}
            trigger={<Shapes aria-hidden className="size-4" />}
          >
            <IconsEditor icons={tweaks.icons} onTweak={onTweak} />
          </MenuPopover>
        )}

        <Divider />

        <TooltipWrapper label={t("moreFrameOptions")} side="top">
          <button
            aria-label={t("moreFrameOptions")}
            className={menuButton}
            onClick={onMoreOptions}
            type="button"
          >
            <Setting4 aria-hidden className="size-4" />
          </button>
        </TooltipWrapper>

        {showLeft && (
          <span
            className="text-muted-foreground px-2 text-xs tabular-nums"
            id={counterId}
          >
            {t("leftLeft", { left })}
          </span>
        )}
      </div>
    </div>
  );
}
