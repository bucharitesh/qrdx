"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/design-system/components/ui/popover";
import { Slider } from "@repo/design-system/components/ui/slider";
import {
  DEFAULT_FRAME_TEXT,
  FRAME_FONT_SCALE_MAX,
  FRAME_FONT_SCALE_MIN,
  FRAME_TEXT_MAX_LENGTH,
  type FrameStyle,
  GRADIENT_FRAME_DEFAULTS,
  mixFrameColors,
  QRCodeSVG,
  type QRFrame,
} from "qrdx";
import { useEffect, useState } from "react";
import { HexColorPicker } from "react-colorful";
import { soundEvent } from "@/lib/sound/emit";
import { useQREditorStore } from "@/store/editor-store";
import { FrameTextPresets } from "./frame-text-presets";
import { ShapePicker } from "./option-tiles";

// Every frame style (20: fills a 3-column grid with no lone tile)
const FRAME_OPTIONS: { id: FrameStyle; name: string }[] = [
  { id: "none", name: "None" },
  { id: "banner-bottom", name: "Banner" },
  { id: "banner-top", name: "Top banner" },
  { id: "banner-top-bottom", name: "Two banners" },
  { id: "border", name: "Border" },
  { id: "rounded-border", name: "Rounded" },
  { id: "gradient-border", name: "Gradient" },
  { id: "focus", name: "Focus" },
  { id: "speech-bubble", name: "Bubble" },
  { id: "speech-bubble-top", name: "Bubble top" },
  { id: "chat-bubble", name: "Chat" },
  { id: "circle", name: "Circle" },
  { id: "badge", name: "Ribbon" },
  { id: "sticker", name: "Sticker" },
  { id: "polaroid", name: "Polaroid" },
  { id: "phone", name: "Phone" },
  { id: "ticket", name: "Ticket" },
  { id: "tag", name: "Tag" },
  { id: "envelope", name: "Envelope" },
  { id: "menu-card", name: "Menu card" },
];

/** Name for the collapsed Frame header. */
export function frameName(id: string) {
  return FRAME_OPTIONS.find((option) => option.id === id)?.name ?? "None";
}

const FRAME_FEATURED: FrameStyle[] = [
  "none",
  "banner-bottom",
  "rounded-border",
  "speech-bubble",
  "polaroid",
];

const FRAME_CATEGORIES = [
  { id: "banners", label: "Banners" },
  { id: "borders", label: "Borders" },
  { id: "bubbles", label: "Bubbles" },
  { id: "objects", label: "Objects" },
];

const FRAME_CATEGORY: Partial<Record<FrameStyle, string>> = {
  none: "borders",
  border: "borders",
  "rounded-border": "borders",
  "gradient-border": "borders",
  focus: "borders",
  circle: "borders",
  "banner-bottom": "banners",
  "banner-top": "banners",
  "banner-top-bottom": "banners",
  badge: "banners",
  tag: "banners",
  "speech-bubble": "bubbles",
  "speech-bubble-top": "bubbles",
  "chat-bubble": "bubbles",
};

// Frames whose label sits on the light area, so it defaults to the frame color
const TEXT_ON_LIGHT = new Set<FrameStyle>([
  "border",
  "rounded-border",
  "phone",
  "menu-card",
  "focus",
]);

// Frames with a second label
const SECOND_LINE = new Set<FrameStyle>([
  "banner-top-bottom",
  "circle",
  "menu-card",
]);

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
              className="size-9 shrink-0 rounded-full border shadow-xs disabled:opacity-50"
              style={{ backgroundColor: value }}
              type="button"
            />
          </PopoverTrigger>
          <PopoverContent className="w-auto p-3">
            <HexColorPicker color={value} onChange={onChange} />
          </PopoverContent>
        </Popover>
        <Input
          className="flex-1 font-mono text-sm"
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
  const isGradient = frame.style === "gradient-border";
  const frameColor =
    frame.color ?? (isGradient ? GRADIENT_FRAME_DEFAULTS.from : "#000000");
  const endColor = frame.secondaryColor ?? GRADIENT_FRAME_DEFAULTS.to;
  const textColor =
    frame.textColor ??
    (isGradient
      ? mixFrameColors(frameColor, endColor, 0.5)
      : TEXT_ON_LIGHT.has(frame.style)
        ? frameColor
        : "#ffffff");
  const fontScale = frame.fontScale ?? 1;

  const updateFrame = (changes: Partial<QRFrame>) => {
    setThemeState({
      ...themeState,
      styles: { ...style, frame: { ...frame, ...changes } },
    });
  };

  return (
    <div className="space-y-4">
      <ShapePicker
        categories={FRAME_CATEGORIES}
        category={(id) => FRAME_CATEGORY[id] ?? "objects"}
        featured={FRAME_FEATURED}
        label="Call-to-action frame"
        noun="frames"
        onChange={(id) => {
          updateFrame({ style: id });
          soundEvent("tick");
        }}
        options={FRAME_OPTIONS}
        preview={(id) => (
          <QRCodeSVG
            bgColor="#ffffff"
            bodyPattern="square"
            cornerEyeDotPattern="square"
            cornerEyePattern="square"
            fgColor="#000000"
            frame={{
              style: id,
              text: "",
              // Each tile keeps its own default palette until a color is picked
              ...(frame.color && { color: frame.color }),
            }}
            size={40}
            style={{ maxHeight: "100%", maxWidth: "100%" }}
            value="qrdx.dev"
          />
        )}
        value={frame.style}
      />

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs" htmlFor="frame-text">
            Label
          </Label>
          <span className="text-muted-foreground text-xs tabular-nums">
            {(frame.text ?? DEFAULT_FRAME_TEXT).length}/{FRAME_TEXT_MAX_LENGTH}
          </span>
        </div>
        <Input
          disabled={!active}
          id="frame-text"
          maxLength={FRAME_TEXT_MAX_LENGTH}
          onChange={(event) =>
            updateFrame({
              text: event.target.value.slice(0, FRAME_TEXT_MAX_LENGTH),
            })
          }
          placeholder={
            active ? "Leave empty for no label" : "Pick a frame first"
          }
          value={frame.text ?? DEFAULT_FRAME_TEXT}
        />
        <FrameTextPresets />
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
        {isGradient && (
          <FrameColorField
            id="frame-end-color"
            label="End color"
            onChange={(color) => updateFrame({ secondaryColor: color })}
            value={endColor}
          />
        )}
      </div>

      {SECOND_LINE.has(frame.style) && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs" htmlFor="frame-secondary-text">
              Second line
            </Label>
            <span className="text-muted-foreground text-xs tabular-nums">
              {(frame.secondaryText ?? "").length}/{FRAME_TEXT_MAX_LENGTH}
            </span>
          </div>
          <Input
            id="frame-secondary-text"
            maxLength={FRAME_TEXT_MAX_LENGTH}
            onChange={(event) =>
              updateFrame({
                secondaryText: event.target.value.slice(
                  0,
                  FRAME_TEXT_MAX_LENGTH,
                ),
              })
            }
            placeholder="Optional, e.g. your website"
            value={frame.secondaryText ?? ""}
          />
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs" htmlFor="frame-font-scale">
            Text size
          </Label>
          <span className="text-muted-foreground text-xs tabular-nums">
            {Math.round(fontScale * 100)}%
          </span>
        </div>
        <Slider
          disabled={!active}
          id="frame-font-scale"
          max={FRAME_FONT_SCALE_MAX}
          min={FRAME_FONT_SCALE_MIN}
          onValueChange={([value]) => updateFrame({ fontScale: value })}
          step={0.05}
          value={[fontScale]}
        />
      </div>

      <p className="text-muted-foreground text-xs">
        The frame is added around the code, so the downloaded image gets bigger
        and the code itself stays scannable.
      </p>
    </div>
  );
}
