"use client";

import { useHideFeaturebaseLauncher } from "@repo/analytics/featurebase-launcher";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@repo/design-system/components/ui/sheet";
import { cn } from "@repo/design-system/lib/utils";
import { Setting4 } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
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
import type { PreviewLabel } from "./preview-labels";

type ColorField = "text" | "frame";

/**
 * Phones: tapping frame text opens this sheet with the inline menu's fields.
 * It doesn't cover the preview (no overlay), so every change shows above it.
 * Done, Enter or a tap outside keeps the edit; Escape puts it back.
 */
export function FrameTextSheet({
  label,
  target,
  text,
  tweaks,
  onText,
  onTweak,
  onCommit,
  onCancel,
  onMoreOptions,
}: {
  label: PreviewLabel;
  target: FrameTextTarget;
  text: string;
  tweaks: FrameTweaks;
  onText: (text: string) => void;
  onTweak: (tweak: FrameTweak) => void;
  onCommit: () => void;
  onCancel: () => void;
  onMoreOptions: () => void;
}) {
  const t = useTranslations("editor.frameInline.frameTextSheet");
  // Featurebase's launcher would sit over Done
  useHideFeaturebaseLauncher();
  const inputId = useId();
  const counterId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [color, setColor] = useState<ColorField | null>(null);
  const contrast = labelContrast(label.fill, label.behind);
  const showLeft = nearTextLimit(text, target.maxLength);
  const colors = [
    tweaks.textColor && {
      id: "text" as const,
      name: "Text color",
      value: tweaks.textColor,
    },
    tweaks.frameColor && {
      id: "frame" as const,
      name: "Frame color",
      value: tweaks.frameColor,
    },
  ].filter((item): item is { id: ColorField; name: string; value: string } =>
    Boolean(item),
  );
  const open = colors.find((item) => item.id === color);

  return (
    <Sheet
      modal={false}
      onOpenChange={(next) => {
        if (!next) onCommit();
      }}
      open
    >
      <SheetContent
        // Stops short of the preview (the top third), so changes stay in view
        className="z-[120] max-h-[56svh] gap-0 rounded-t-xl p-0"
        data-frame-inline=""
        onEscapeKeyDown={(event) => {
          event.preventDefault();
          onCancel();
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus({ preventScroll: true });
          inputRef.current?.select();
        }}
        side="bottom"
      >
        <div className="px-4 pt-4 pr-12 pb-2">
          <SheetTitle className="text-sm">{t("editFrameText")}</SheetTitle>
          <SheetDescription className="sr-only">
            {t("changesShowOnTheCode")}
          </SheetDescription>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 pb-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs" htmlFor={inputId}>
                {target.name}
              </Label>
              {showLeft && (
                <span
                  className="text-muted-foreground text-xs tabular-nums"
                  id={counterId}
                >
                  {t("valueLeft", {
                    value: charactersLeft(text, target.maxLength),
                  })}
                </span>
              )}
            </div>
            <Input
              aria-describedby={showLeft ? counterId : undefined}
              autoComplete="off"
              enterKeyHint="done"
              id={inputId}
              onChange={(event) => onText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  onCommit();
                }
              }}
              ref={inputRef}
              spellCheck={false}
              value={text}
            />
          </div>

          <FrameTextSize
            onChange={(value) => onTweak({ kind: "fontScale", value })}
            value={tweaks.fontScale}
          />

          {colors.length > 0 && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                {colors.map((item) => (
                  <button
                    aria-expanded={color === item.id}
                    className={cn(
                      "bg-card hover:bg-accent/40 flex h-10 items-center gap-2 rounded-md border px-3 text-left text-xs font-medium transition-colors outline-none",
                      "focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-expanded:border-foreground/40",
                    )}
                    key={item.id}
                    onClick={() =>
                      setColor((current) =>
                        current === item.id ? null : item.id,
                      )
                    }
                    type="button"
                  >
                    <span
                      aria-hidden
                      className="size-5 shrink-0 rounded-full border shadow-xs"
                      style={{ backgroundColor: item.value }}
                    />
                    {item.name}
                  </button>
                ))}
              </div>
              {open && (
                <ColorEditor
                  label={open.name}
                  onChange={(value) =>
                    onTweak({
                      kind: open.id === "text" ? "textColor" : "frameColor",
                      value,
                    })
                  }
                  value={open.value}
                />
              )}
              <ContrastNote ratio={contrast} />
            </div>
          )}

          {tweaks.icons.length > 0 && (
            <IconsEditor icons={tweaks.icons} onTweak={onTweak} />
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t px-4 py-3">
          <Button
            onClick={onMoreOptions}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Setting4 aria-hidden className="size-4" />
            {t("moreFrameOptions")}
          </Button>
          <Button onClick={onCommit} size="sm" type="button">
            {t("done")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
