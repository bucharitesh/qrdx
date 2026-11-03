"use client";

import { authClient } from "@repo/auth/client";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { useQuery } from "@tanstack/react-query";
import { Brush2, DocumentUpload, Global } from "iconsax-reactjs";
import {
  type AnyQRFrame,
  DEFAULT_FRAME_TEXT,
  FRAME_TEXT_MAX_LENGTH,
  type FrameStyle,
  GRADIENT_FRAME_DEFAULTS,
  mixFrameColors,
  OFFICIAL_FRAMES,
  QRCodeSVG,
  type QRCustomFrame,
} from "qrdx";
import { useMemo, useState } from "react";
import { getSavedCommunityFrames } from "@/actions/community";
import { ImportFrameDialog } from "@/components/community/import-frame-dialog";
import { PublishFrameDialog } from "@/components/community/publish-frame-dialog";
import { useEditableStyle } from "@/components/editor/style-scope";
import {
  BUILT_IN_SPEC_STYLES,
  builtInSpec,
  officialFrameOfSpec,
} from "@/lib/community/catalog";
import { useSessionGuard } from "@/lib/hooks/use-gaurds";
import { soundEvent } from "@/lib/sound/emit";
import { CustomFrameFields } from "./custom-frame-fields";
import { FrameColorField, FrameTextSize } from "./frame-fields";
import { carryFrameSettings, customFrameName } from "./frame-specs";
import { FrameTextPresets } from "./frame-text-presets";
import { ShapePicker } from "./option-tiles";

// One picker for every frame: the engine's built-in call-to-action frames,
// QRdx's official frames (frame specs, from the engine's catalogue) and the
// frames you saved from the community. Official and saved frames are custom
// frames: their labels, colors and icons are edited through the spec.

const BUILT_IN_OPTIONS: { id: FrameStyle; name: string }[] = [
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

const OFFICIAL_PREFIX = "official:";
const SAVED_PREFIX = "saved:";
const CUSTOM_ID = "custom";

/** Name for the collapsed Frame header. */
export function frameName(frame: AnyQRFrame | undefined) {
  if (!frame || frame.style === "none") return "None";
  if (frame.style === "custom") return customFrameName(frame);
  return (
    BUILT_IN_OPTIONS.find((option) => option.id === frame.style)?.name ?? "None"
  );
}

const FEATURED = [
  "none",
  "banner-bottom",
  "rounded-border",
  `${OFFICIAL_PREFIX}wifi-card`,
  `${OFFICIAL_PREFIX}review-us`,
];

const CATEGORIES = [
  { id: "ready-made", label: "Ready-made" },
  { id: "seasonal", label: "Seasonal" },
  { id: "banners", label: "Banners" },
  { id: "borders", label: "Borders" },
  { id: "bubbles", label: "Bubbles" },
  { id: "objects", label: "Objects" },
];

const BUILT_IN_CATEGORY: Partial<Record<FrameStyle, string>> = {
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

/** Frames saved from the community, for the signed-in picker. */
function useSavedFrames() {
  const { data: session } = authClient.useSession();
  return useQuery({
    queryKey: ["community", "saved-frames", session?.user?.id ?? null],
    queryFn: () => getSavedCommunityFrames(),
    enabled: Boolean(session?.user),
    staleTime: 60_000,
  });
}

export function FrameControls() {
  const { style, setStyle } = useEditableStyle();
  const { checkValidSession } = useSessionGuard();
  const frame: AnyQRFrame = style.frame ?? { style: "none" };
  const custom = frame.style === "custom" ? frame : null;
  const builtIn = frame.style === "custom" ? null : frame;
  const { data: saved = [] } = useSavedFrames();
  const [importOpen, setImportOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);

  const setFrame = (next: AnyQRFrame) => setStyle({ ...style, frame: next });

  // Every option the picker shows, keyed by a string id
  const options = useMemo(() => {
    const list: { id: string; name: string; frame: AnyQRFrame }[] = [
      ...BUILT_IN_OPTIONS.map((option) => ({
        id: option.id as string,
        name: option.name,
        frame: { style: option.id, text: "" } as AnyQRFrame,
      })),
      ...OFFICIAL_FRAMES.map((official) => ({
        id: `${OFFICIAL_PREFIX}${official.id}`,
        name: official.name,
        frame: { style: "custom", spec: official.spec } as QRCustomFrame,
      })),
      ...saved.map((item) => ({
        id: `${SAVED_PREFIX}${item.id}`,
        name: item.name,
        frame: item.frame,
      })),
    ];
    return list;
  }, [saved]);

  const value = useMemo(() => {
    if (!custom) return frame.style as string;
    const official = officialFrameOfSpec(custom.spec);
    if (official) return `${OFFICIAL_PREFIX}${official.id}`;
    const json = JSON.stringify(custom.spec);
    const match = saved.find(
      (item) => JSON.stringify(item.frame.spec) === json,
    );
    return match ? `${SAVED_PREFIX}${match.id}` : CUSTOM_ID;
  }, [custom, frame.style, saved]);

  const pickerOptions =
    value === CUSTOM_ID && custom
      ? [...options, { id: CUSTOM_ID, name: "Custom", frame: custom }]
      : options;
  const byId = new Map(pickerOptions.map((option) => [option.id, option]));

  const categoryOf = (id: string) => {
    if (id.startsWith(SAVED_PREFIX)) return "saved";
    if (id === CUSTOM_ID) return "ready-made";
    if (id.startsWith(OFFICIAL_PREFIX)) {
      const official = OFFICIAL_FRAMES.find(
        (item) => `${OFFICIAL_PREFIX}${item.id}` === id,
      );
      return official?.category === "seasonal" ? "seasonal" : "ready-made";
    }
    return BUILT_IN_CATEGORY[id as FrameStyle] ?? "objects";
  };

  const pick = (id: string) => {
    const option = byId.get(id);
    if (!option) return;
    soundEvent("tick");
    if (option.frame.style === "custom") {
      // A ready-made frame looks like its tile: its own labels and colors.
      setFrame(id === CUSTOM_ID && custom ? custom : option.frame);
      return;
    }
    // A built-in style keeps the text and colors chosen so far.
    setFrame({ ...carryFrameSettings(frame), style: option.frame.style });
  };

  const editableSpec =
    builtIn && BUILT_IN_SPEC_STYLES.includes(builtIn.style)
      ? builtInSpec(builtIn.style)
      : undefined;

  return (
    <div className="space-y-4">
      <ShapePicker
        categories={[
          ...CATEGORIES,
          ...(saved.length > 0 ? [{ id: "saved", label: "Saved" }] : []),
        ]}
        category={categoryOf}
        featured={FEATURED}
        label="Frame"
        noun="frames"
        onChange={pick}
        options={pickerOptions.map(({ id, name }) => ({ id, name }))}
        preview={(id) => {
          const option = byId.get(id);
          if (!option) return null;
          return (
            <QRCodeSVG
              bgColor="#ffffff"
              bodyPattern="square"
              cornerEyeDotPattern="square"
              cornerEyePattern="square"
              fgColor="#000000"
              frame={
                option.frame.style === "custom" || !frame.color
                  ? option.frame
                  : // Built-in tiles take the chosen frame color
                    { ...option.frame, color: frame.color }
              }
              size={40}
              style={{ maxHeight: "100%", maxWidth: "100%" }}
              value="qrdx.dev"
            />
          );
        }}
        value={value}
      />

      {custom ? (
        <CustomFrameFields frame={custom} onChange={setFrame} />
      ) : (
        builtIn && (
          <BuiltInFrameFields
            frame={builtIn}
            onChange={(changes) => setFrame({ ...builtIn, ...changes })}
          />
        )
      )}

      <div className="flex flex-wrap gap-2">
        {editableSpec && builtIn && (
          <Button
            onClick={() => {
              setFrame({
                ...carryFrameSettings(builtIn),
                style: "custom",
                spec: editableSpec,
              });
              soundEvent("tick");
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            <Brush2 aria-hidden className="size-4" />
            Customise
          </Button>
        )}
        <Button
          onClick={() => {
            if (checkValidSession("signin")) setImportOpen(true);
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          <DocumentUpload aria-hidden className="size-4" />
          Import SVG
        </Button>
        {custom && (
          <Button
            onClick={() => {
              if (checkValidSession("signin")) setPublishOpen(true);
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            <Global aria-hidden className="size-4" />
            Publish frame
          </Button>
        )}
      </div>

      <p className="text-muted-foreground text-xs">
        The frame is added around the code, so the downloaded image gets bigger
        and the code itself stays scannable.
      </p>

      <ImportFrameDialog
        onImported={(spec) => {
          setFrame({ style: "custom", spec });
          soundEvent("tick");
        }}
        onOpenChange={setImportOpen}
        open={importOpen}
      />
      {custom && (
        <PublishFrameDialog
          frame={custom}
          onOpenChange={setPublishOpen}
          open={publishOpen}
        />
      )}
    </div>
  );
}

type BuiltInFrame = Exclude<AnyQRFrame, QRCustomFrame>;

/** Label, colors and text size of a built-in frame. */
function BuiltInFrameFields({
  frame,
  onChange,
}: {
  frame: BuiltInFrame;
  onChange: (changes: Partial<BuiltInFrame>) => void;
}) {
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

  return (
    <>
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
            onChange({
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
          onChange={(color) => onChange({ color })}
          value={frameColor}
        />
        <FrameColorField
          disabled={!active}
          id="frame-text-color"
          label="Text color"
          onChange={(color) => onChange({ textColor: color })}
          value={textColor}
        />
        {isGradient && (
          <FrameColorField
            id="frame-end-color"
            label="End color"
            onChange={(color) => onChange({ secondaryColor: color })}
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
              onChange({
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

      <FrameTextSize
        disabled={!active}
        onChange={(value) => onChange({ fontScale: value })}
        value={fontScale}
      />
    </>
  );
}
