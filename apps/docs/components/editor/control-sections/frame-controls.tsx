"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/design-system/components/ui/popover";
import { cn } from "@repo/design-system/lib/utils";
import {
  DEFAULT_FRAME_TEXT,
  FRAME_TEXT_MAX_LENGTH,
  type FrameStyle,
  QRCodeSVG,
  type QRFrame,
} from "qrdx";
import { useEffect, useState } from "react";
import { HexColorPicker } from "react-colorful";
import { useQREditorStore } from "@/store/editor-store";

const FRAME_OPTIONS: { id: FrameStyle; name: string }[] = [
  { id: "none", name: "None" },
  { id: "banner-bottom", name: "Banner" },
  { id: "banner-top", name: "Top banner" },
  { id: "border", name: "Border" },
  { id: "rounded-border", name: "Rounded" },
  { id: "speech-bubble", name: "Bubble" },
];

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

interface FrameColorFieldProps {
  id: string;
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (color: string) => void;
}

function FrameColorField({
  id,
  label,
  value,
  disabled,
  onChange,
}: FrameColorFieldProps) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <div className="space-y-1.5">
      <Label className="text-xs" htmlFor={id}>
        {label}
      </Label>
      <div className="flex items-center gap-2">
        <Popover>
          <PopoverTrigger asChild disabled={disabled}>
            <button
              aria-label={`Pick ${label.toLowerCase()}`}
              className="size-8 shrink-0 rounded border border-border/60 disabled:opacity-50"
              style={{ backgroundColor: value }}
              type="button"
            />
          </PopoverTrigger>
          <PopoverContent className="w-auto p-3">
            <HexColorPicker color={value} onChange={onChange} />
          </PopoverContent>
        </Popover>
        <Input
          className="h-8 flex-1 font-mono text-sm"
          disabled={disabled}
          id={id}
          maxLength={7}
          onBlur={() => setDraft(value)}
          onChange={(event) => {
            setDraft(event.target.value);
            if (HEX_COLOR.test(event.target.value)) {
              onChange(event.target.value);
            }
          }}
          placeholder="#000000"
          value={draft}
        />
      </div>
    </div>
  );
}

export function FrameControls() {
  const { themeState, setThemeState } = useQREditorStore();
  const style = themeState.styles;
  const frame: QRFrame = style.frame ?? { style: "none" };
  const active = frame.style !== "none";
  const isBanner = frame.style !== "border" && frame.style !== "rounded-border";
  const frameColor = frame.color ?? "#000000";
  const textColor = frame.textColor ?? (isBanner ? "#ffffff" : frameColor);

  const updateFrame = (changes: Partial<QRFrame>) => {
    setThemeState({
      ...themeState,
      styles: { ...style, frame: { ...frame, ...changes } },
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {FRAME_OPTIONS.map((option) => {
          const selected = frame.style === option.id;
          return (
            <button
              aria-pressed={selected}
              className={cn(
                "relative flex cursor-pointer flex-col items-center gap-2 rounded-lg bg-white p-3 ring-2 transition-all hover:shadow-md",
                selected
                  ? "bg-black/5 ring-blue-400 dark:bg-white"
                  : "ring-gray-200 hover:ring-gray-300",
              )}
              key={option.id}
              onClick={() => updateFrame({ style: option.id })}
              type="button"
            >
              <div className="flex h-16 w-16 items-center justify-center">
                <QRCodeSVG
                  bgColor="#ffffff"
                  bodyPattern="square"
                  cornerEyeDotPattern="square"
                  cornerEyePattern="square"
                  fgColor="#000000"
                  frame={{
                    style: option.id,
                    text: "",
                    color: frameColor,
                  }}
                  size={36}
                  style={{ maxHeight: "100%", maxWidth: "100%" }}
                  value="qrdx.dev"
                />
              </div>
              <span className="text-center text-black text-xs font-medium">
                {option.name}
              </span>
              {selected && (
                <span className="absolute top-2 right-2 flex size-4 items-center justify-center rounded-full bg-blue-400 text-[10px] font-bold text-white">
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs" htmlFor="frame-text">
            Call to action
          </Label>
          <span className="text-muted-foreground text-xs tabular-nums">
            {(frame.text ?? DEFAULT_FRAME_TEXT).length}/{FRAME_TEXT_MAX_LENGTH}
          </span>
        </div>
        <Input
          className="h-8 text-sm"
          disabled={!active}
          id="frame-text"
          maxLength={FRAME_TEXT_MAX_LENGTH}
          onChange={(event) =>
            updateFrame({
              text: event.target.value.slice(0, FRAME_TEXT_MAX_LENGTH),
            })
          }
          placeholder="Leave empty for no label"
          value={frame.text ?? DEFAULT_FRAME_TEXT}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FrameColorField
          disabled={!active}
          id="frame-color"
          label="Frame color"
          onChange={(color) => updateFrame({ color })}
          value={frameColor}
        />
        <FrameColorField
          disabled={!active}
          id="frame-text-color"
          label="Text color"
          onChange={(color) => updateFrame({ textColor: color })}
          value={textColor}
        />
      </div>

      <p className="text-muted-foreground text-xs">
        The frame is added around the code, so the downloaded image gets bigger
        and the code itself stays scannable.
      </p>
    </div>
  );
}
