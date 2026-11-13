"use client";

import { authClient } from "@repo/auth/client";
import { CANONICAL_HOST } from "@repo/config";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { useQuery } from "@tanstack/react-query";
import { DocumentUpload, Global } from "iconsax-reactjs";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import {
  type AnyQRFrame,
  BUILT_IN_FRAMES,
  frameSpecOf,
  getBuiltInFrame,
  QRCodeSVG,
} from "qrdx";
import { useContext, useMemo, useState } from "react";
import { getSavedCommunityFrames } from "@/actions/community";
import { useEditableStyle } from "@/components/editor/style-scope";
import { peekOfficialEntryOfSpec } from "@/lib/frames/library";
import { useFrameLibrary } from "@/lib/frames/use-frame-library";
import { useSessionGuard } from "@/lib/hooks/use-gaurds";
import { soundEvent } from "@/lib/sound/emit";
import { SectionContext } from "../section-context";
import { FrameSpecFields } from "./custom-frame-fields";
import { type FrameChoice, FramePicker, OFFICIAL_PREFIX } from "./frame-picker";
import {
  FRAME_SHAPE_IDS,
  type FrameShapeId,
  frameShapeOf,
  type ShapedCodes,
  ShapePreview,
  useShapedCodes,
  withoutShape,
} from "./frame-shapes";
import { carryFrameSettings, customFrameName } from "./frame-specs";
import { FrameTextPresets } from "./frame-text-presets";

// One picker for every frame: the engine's built-in frames (the classic
// call-to-action frames), the shaped codes, QRdx's official frame library
// (frame specs, loaded on demand from the engine's catalogue,
// lib/frames/library.ts) and the frames you saved from the community.
// Every frame is a frame spec, so all of them are edited the same way:
// labels, colors, text size and icons through the spec (FrameSpecFields).
//
// A built-in frame keeps its style name in the design ({ style: "border",
// text, color, … }), as saved designs, links, the image API, the CLI and
// code snippets hold it: it draws the engine's spec for that style, and
// every field the editor changes (text, second line, colors, text size)
// lives on the frame itself, so there is nothing to convert.

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

const NONE = "none";
const SAVED_PREFIX = "saved:";
const SHAPE_PREFIX = "shape:";
const CUSTOM_ID = "custom";

/** Name for the collapsed Frame header. */
export function frameName(frame: AnyQRFrame | undefined, none: string) {
  if (!frame || frame.style === "none") return none;
  if (frame.style === "custom") return customFrameName(frame);
  return getBuiltInFrame(frame.style)?.name ?? none;
}

const FEATURED = [
  NONE,
  "banner-bottom",
  "rounded-border",
  `${OFFICIAL_PREFIX}wifi-card`,
  `${SHAPE_PREFIX}circle`,
];

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

/**
 * The frame picker on its own: the built-in frames, the shaped codes, the
 * official library and the frames you saved. A built-in frame keeps the
 * text and colors chosen so far; a ready-made frame comes as its tile shows
 * it; a shaped code takes the frame's place. Pass `shapes` when the shaped
 * code panel is shown elsewhere (FrameControls); on its own the picker
 * shows the panel under it.
 */
export function FrameStylePicker({
  active = true,
  shapes: given,
}: {
  active?: boolean;
  shapes?: ShapedCodes;
}) {
  const t = useTranslations("editor.controlSections.frameControls");
  const { style, setStyle } = useEditableStyle();
  const own = useShapedCodes();
  const shapes = given ?? own;
  const frame: AnyQRFrame = style.frame ?? { style: "none" };
  const custom = frame.style === "custom" ? frame : null;
  const { data: saved = [] } = useSavedFrames();

  // A frame takes the place of a shaped code (frame-shapes.tsx)
  const setFrame = (next: AnyQRFrame) =>
    setStyle({ ...withoutShape(style), frame: next });
  const shape = frameShapeOf(style) ?? shapes.current;

  // The picker's own tiles: no frame, the built-in frames, the shaped
  // codes, saved frames. Official frames come from the library
  // (frame-picker.tsx).
  const choices = useMemo(() => {
    const list: FrameChoice[] = [
      {
        id: NONE,
        name: t("none"),
        frame: { style: "none" },
        group: "built-in",
        keywords: "no frame plain square",
      },
      ...BUILT_IN_FRAMES.map(
        (item): FrameChoice => ({
          id: item.style,
          name: item.name,
          frame: { style: item.style, text: "" },
          group: "built-in",
          keywords: `classic built-in ${item.tags.join(" ")}`,
        }),
      ),
      ...FRAME_SHAPE_IDS.map(
        (id): FrameChoice => ({
          id: `${SHAPE_PREFIX}${id}`,
          name: shapes.names[id],
          frame: { style: "none" },
          group: "shape",
          keywords: `shape shaped code ${id} round heart outline upload`,
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
  }, [saved, shapes.names, t]);

  // Name official frames (and keep the picker current) as the library loads
  useFrameLibrary({ withIndex: Boolean(custom) });
  const official = custom ? peekOfficialEntryOfSpec(custom.spec) : undefined;

  const value = (() => {
    if (shape && frame.style === "none") return `${SHAPE_PREFIX}${shape}`;
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
    if (id.startsWith(SHAPE_PREFIX)) {
      // Plays its own sound, and clears the frame
      shapes.pick(id.slice(SHAPE_PREFIX.length) as FrameShapeId);
      return;
    }
    soundEvent("tick");
    if (picked.style === "custom") {
      // A ready-made frame looks like its tile: its own labels and colors.
      setFrame(id === CUSTOM_ID && custom ? custom : picked);
      return;
    }
    // A built-in frame keeps the text and colors chosen so far.
    setFrame({ ...carryFrameSettings(frame), style: picked.style });
  };

  const currentName =
    shape && frame.style === "none"
      ? shapes.names[shape]
      : frameName(frame, t("none"));

  return (
    <>
      <FramePicker
        active={active}
        choices={pickerChoices}
        currentName={currentName}
        featured={FEATURED}
        onPick={pick}
        preview={(option, id) =>
          id.startsWith(SHAPE_PREFIX) ? (
            <ShapePreview
              id={id.slice(SHAPE_PREFIX.length) as FrameShapeId}
              silhouette={shapes.silhouette}
            />
          ) : (
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
              value={CANONICAL_HOST}
            />
          )
        }
        value={value}
      />
      {given ? null : (
        <div className="mt-3 space-y-3 empty:hidden">{own.panel}</div>
      )}
    </>
  );
}

export function FrameControls() {
  const t = useTranslations("editor.controlSections.frameControls");
  const { style, setStyle } = useEditableStyle();
  const { checkValidSession } = useSessionGuard();
  const shapes = useShapedCodes();
  const frame: AnyQRFrame = style.frame ?? { style: "none" };
  const custom = frame.style === "custom" ? frame : null;
  // Every frame is edited through its spec: its own, or its style's
  const spec = frameSpecOf(frame);
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
  const shaped = frameShapeOf(style) !== null || shapes.current !== null;

  return (
    <div className="space-y-4">
      <FrameStylePicker active={active} shapes={shapes} />

      {shapes.panel}

      {spec ? (
        <FrameSpecFields frame={frame} onChange={setFrame} spec={spec} />
      ) : (
        !shaped && <NoFrameFields />
      )}

      <div className="flex flex-wrap gap-2">
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
          onImported={(imported) => {
            setFrame({ style: "custom", spec: imported });
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

/**
 * With no frame: the label field, waiting for a frame, and label ideas
 * (picking one adds the default frame with that label).
 */
function NoFrameFields() {
  const t = useTranslations("editor.controlSections.frameControls");
  return (
    <div className="space-y-1.5">
      <Label className="text-xs" htmlFor="frame-text">
        {t("label")}
      </Label>
      <Input disabled id="frame-text" placeholder={t("pickAFrameFirst")} />
      <FrameTextPresets />
    </div>
  );
}
