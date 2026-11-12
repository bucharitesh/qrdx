"use client";

import { authClient } from "@repo/auth/client";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { useQuery } from "@tanstack/react-query";
import { Brush2, DocumentUpload, Global } from "iconsax-reactjs";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import {
  type AnyQRFrame,
  DEFAULT_FRAME_TEXT,
  FRAME_TEXT_MAX_LENGTH,
  type FrameStyle,
  GRADIENT_FRAME_DEFAULTS,
  mixFrameColors,
  QRCodeSVG,
  type QRCustomFrame,
} from "qrdx";
import { useContext, useMemo, useState } from "react";
import { getSavedCommunityFrames } from "@/actions/community";
import { useEditableStyle } from "@/components/editor/style-scope";
import { BUILT_IN_SPEC_STYLES, builtInSpec } from "@/lib/frames/built-in";
import { peekOfficialEntryOfSpec } from "@/lib/frames/library";
import { useFrameLibrary } from "@/lib/frames/use-frame-library";
import { useSessionGuard } from "@/lib/hooks/use-gaurds";
import { soundEvent } from "@/lib/sound/emit";
import { SectionContext } from "../section-context";
import { CustomFrameFields } from "./custom-frame-fields";
import { FrameColorField, FrameTextSize } from "./frame-fields";
import { type FrameChoice, FramePicker, OFFICIAL_PREFIX } from "./frame-picker";
import { FrameShapes, frameShapeOf, withoutShape } from "./frame-shapes";
import { carryFrameSettings, customFrameName } from "./frame-specs";
import { FrameTextPresets } from "./frame-text-presets";

// One picker for every frame: the engine's built-in call-to-action frames,
// QRdx's official frame library (frame specs, loaded on demand from the
// engine's catalogue, lib/frames/library.ts) and the frames you saved from
// the community. Official and saved frames are custom frames: their
// labels, colors and icons are edited through the spec.

// Opened rarely: kept out of the editor's first load
const ImportFrameDialog = dynamic(() =>
  import("@/components/community/import-frame-dialog").then(
    (module) => module.ImportFrameDialog,
  ),
);
const PublishFrameDialog = dynamic(() =>
  import("@/components/community/publish-frame-dialog").then(
    (module) => module.PublishFrameDialog,
  ),
);

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

const SAVED_PREFIX = "saved:";
const CUSTOM_ID = "custom";
/** The frame picker's value while a shaped code is on: no frame tile */
const SHAPED_ID = "shaped";

/** Name for the collapsed Frame header. */
export function frameName(frame: AnyQRFrame | undefined, none: string) {
  if (!frame || frame.style === "none") return none;
  if (frame.style === "custom") return customFrameName(frame);
  return (
    BUILT_IN_OPTIONS.find((option) => option.id === frame.style)?.name ?? none
  );
}

const FEATURED = [
  "none",
  "banner-bottom",
  "rounded-border",
  `${OFFICIAL_PREFIX}wifi-card`,
  `${OFFICIAL_PREFIX}review-us`,
];

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
  const t = useTranslations("editor.controlSections.frameControls");
  const { style, setStyle } = useEditableStyle();
  const { checkValidSession } = useSessionGuard();
  const frame: AnyQRFrame = style.frame ?? { style: "none" };
  const custom = frame.style === "custom" ? frame : null;
  const builtIn = frame.style === "custom" ? null : frame;
  const { data: saved = [] } = useSavedFrames();
  // Inside a collapsed section the picker waits (nothing is on screen)
  const section = useContext(SectionContext);
  const active = section ? section.isExpanded : true;
  const [importOpen, setImportOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  // The dialogs load on first open, then stay mounted (for their exit)
  const [dialogs, setDialogs] = useState({ import: false, publish: false });

  // A frame takes the place of a shaped code (frame-shapes.tsx)
  const setFrame = (next: AnyQRFrame) =>
    setStyle({ ...withoutShape(style), frame: next });
  const shaped = frameShapeOf(style) !== null;

  // The picker's own choices: built-ins, saved frames, the custom one.
  // Official frames come from the library (frame-picker.tsx).
  const choices = useMemo(() => {
    const list: FrameChoice[] = [
      ...BUILT_IN_OPTIONS.map(
        (option): FrameChoice => ({
          id: option.id as string,
          name: option.name,
          frame: { style: option.id, text: "" } as AnyQRFrame,
          group: "built-in",
          keywords: "built-in classic",
        }),
      ),
      ...saved.map(
        (item): FrameChoice => ({
          id: `${SAVED_PREFIX}${item.id}`,
          name: item.name,
          frame: item.frame,
          group: "saved",
          keywords: "saved community",
        }),
      ),
    ];
    return list;
  }, [saved]);

  // Name official frames (and keep the picker current) as the library loads
  useFrameLibrary({ withIndex: Boolean(custom) });
  const official = custom ? peekOfficialEntryOfSpec(custom.spec) : undefined;

  const value = (() => {
    if (shaped && frame.style === "none") return SHAPED_ID;
    if (!custom) return frame.style as string;
    if (official) return `${OFFICIAL_PREFIX}${official.id}`;
    const json = JSON.stringify(custom.spec);
    const match = saved.find(
      (item) => JSON.stringify(item.frame.spec) === json,
    );
    return match ? `${SAVED_PREFIX}${match.id}` : CUSTOM_ID;
  })();

  const pickerChoices =
    value === CUSTOM_ID && custom
      ? [
          ...choices,
          {
            id: CUSTOM_ID,
            name: "Custom",
            frame: custom,
            group: "custom" as const,
          },
        ]
      : choices;

  const pick = (id: string, picked: AnyQRFrame) => {
    soundEvent("tick");
    if (picked.style === "custom") {
      // A ready-made frame looks like its tile: its own labels and colors.
      setFrame(id === CUSTOM_ID && custom ? custom : picked);
      return;
    }
    // A built-in style keeps the text and colors chosen so far.
    setFrame({ ...carryFrameSettings(frame), style: picked.style });
  };

  const editableSpec =
    builtIn && BUILT_IN_SPEC_STYLES.includes(builtIn.style)
      ? builtInSpec(builtIn.style)
      : undefined;

  return (
    <div className="space-y-4">
      <FramePicker
        active={active}
        choices={pickerChoices}
        currentName={frameName(frame, t("none"))}
        featured={FEATURED}
        onPick={pick}
        preview={(option) => (
          <QRCodeSVG
            bgColor="#ffffff"
            bodyPattern="square"
            cornerEyeDotPattern="square"
            cornerEyePattern="square"
            fgColor="#000000"
            frame={
              option.style === "custom" || !frame.color
                ? option
                : // Built-in tiles take the chosen frame color
                  { ...option, color: frame.color }
            }
            size={40}
            style={{ maxHeight: "100%", maxWidth: "100%" }}
            value="qrdx.dev"
          />
        )}
        value={value}
      />

      <FrameShapes setStyle={setStyle} style={style} />

      {shaped && frame.style === "none" ? null : custom ? (
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
            {t("customise")}
          </Button>
        )}
        <Button
          onClick={() => {
            if (!checkValidSession("signin")) return;
            setDialogs((used) => ({ ...used, import: true }));
            setImportOpen(true);
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          <DocumentUpload aria-hidden className="size-4" />
          {t("importSvg")}
        </Button>
        {custom && (
          <Button
            onClick={() => {
              if (!checkValidSession("signin")) return;
              setDialogs((used) => ({ ...used, publish: true }));
              setPublishOpen(true);
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            <Global aria-hidden className="size-4" />
            {t("publishFrame")}
          </Button>
        )}
      </div>

      <p className="text-muted-foreground text-xs">
        {t("theFrameIsAddedAround")}
      </p>

      {dialogs.import && (
        <ImportFrameDialog
          onImported={(spec) => {
            setFrame({ style: "custom", spec });
            soundEvent("tick");
          }}
          onOpenChange={setImportOpen}
          open={importOpen}
        />
      )}
      {custom && dialogs.publish && (
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
  const t = useTranslations("editor.controlSections.frameControls");
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
            {t("label")}
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
            active ? t("leaveEmptyForNoLabel") : t("pickAFrameFirst")
          }
          value={frame.text ?? DEFAULT_FRAME_TEXT}
        />
        <FrameTextPresets />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FrameColorField
          disabled={!active}
          id="frame-color"
          label={t("frameColor")}
          onChange={(color) => onChange({ color })}
          value={frameColor}
        />
        <FrameColorField
          disabled={!active}
          id="frame-text-color"
          label={t("textColor")}
          onChange={(color) => onChange({ textColor: color })}
          value={textColor}
        />
        {isGradient && (
          <FrameColorField
            id="frame-end-color"
            label={t("endColor")}
            onChange={(color) => onChange({ secondaryColor: color })}
            value={endColor}
          />
        )}
      </div>

      {SECOND_LINE.has(frame.style) && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs" htmlFor="frame-secondary-text">
              {t("secondLine")}
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
            placeholder={t("optionalEGYourWebsite")}
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
