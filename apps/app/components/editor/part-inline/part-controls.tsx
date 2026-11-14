"use client";

import { CANONICAL_HOST } from "@repo/config";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Crop,
  DocumentText,
  Element3,
  Eye,
  EyeSlash,
  Gallery,
  Maximize4,
  Paintbucket,
  PictureFrame,
  RecordCircle,
  RefreshLeftSquare,
  Scan,
  SecuritySafe,
  Shapes,
  Size,
} from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { getQRData, QRCodeSVG, resolveErrorLevel } from "qrdx";
import type { ColorConfig, EyePosition } from "qrdx/types";
import { type ReactNode, useMemo } from "react";
import { defaultThemeState } from "@/config/qr";
import { DEFAULT_QR_LOGO } from "@/lib/constants";
import { roleOf } from "@/lib/paint/contrast";
import { styleEngineOptions } from "@/lib/qr-design/engine-options";
import { soundEvent } from "@/lib/sound/emit";
import type { QRStyle } from "@/types/theme";
import { DotSizeControl, dotSize } from "../control-sections/dot-size-section";
import {
  eyeInnerColor,
  eyeOuterColor,
  hasEyeColors,
  withEyeColor,
  withoutEyeColor,
} from "../control-sections/eye-colors";
import { FrameStylePicker } from "../control-sections/frame-controls";
import { useLogoUpload } from "../control-sections/logo-controls";
import { LogoCropControls } from "../control-sections/logo-crop-controls";
import {
  AutoLevelControl,
  LogoClearSpaceControl,
  LogoSizeControl,
  logoOptionsChange,
  useLogoSize,
} from "../control-sections/logo-options-section";
import { LogoPresets } from "../control-sections/logo-presets";
import {
  CompactTile,
  OptionGrid,
  OptionGroupLabel,
} from "../control-sections/option-tiles";
import { PaddingControls } from "../control-sections/padding-controls";
import {
  DotPatternControl,
  ErrorLevelControl,
  EyeCentreShapeControl,
  EyeOuterShapeControl,
} from "../control-sections/pattern-controls";
import { frameTweaks, withFrameTweak } from "../frame-inline/frame-text-fields";
import { ColorEditor } from "../frame-inline/frame-text-menu";
import { Swatch } from "../frame-inline/inline-toolbar";
import {
  PaintPanel,
  paintBackground,
  QR_IMAGE_KINDS,
} from "../paint-picker/paint-panel";
import { useEditorValue } from "../style-scope";
import { ContentField } from "./content-field";
import type { PartId } from "./part-targets";

// What each part's toolbar offers (the phone sheet stacks the same items).
// The menus reuse the Design tab's own controls, so they behave the same;
// they edit the design through the QRStyleScopeProvider the overlay wraps
// around them, which turns every change into a draft of the open edit.

/** A toolbar item that opens a menu. */
export interface PartMenuItem {
  kind: "menu";
  id: string;
  label: string;
  /** What the toolbar button shows (an icon, maybe a value) */
  trigger: ReactNode;
  /** The menu's size rules */
  className?: string;
  content: ReactNode;
}

/** A toolbar item that switches something on or off. */
export interface PartToggleItem {
  kind: "toggle";
  id: string;
  label: string;
  trigger: ReactNode;
  pressed: boolean;
  onToggle: () => void;
}

/** A small two-way switch in the toolbar (All eyes / This eye). */
export interface PartSegmentItem {
  kind: "segment";
  id: string;
  /** Names the pair */
  label: string;
  options: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}

export type PartItem = PartMenuItem | PartToggleItem | PartSegmentItem;

/** The eyes' colors go to every eye, or to the one being edited. */
export type EyeScope = "all" | "one";

export interface PartItemsContext {
  /** The eye the edit started on (or moved to) */
  eye: EyePosition;
  eyeScope: EyeScope;
  onEyeScope: (scope: EyeScope) => void;
  /** Keeps the edit and opens the Content tab with its form */
  onOpenContent: () => void;
}

const icon = "size-4";
const SHAPE_MENU =
  "w-[19rem] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto";
const PAINT_MENU =
  "w-[18.5rem] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto";
const SLIDER_MENU = "w-72";
const LIST_MENU =
  "w-80 max-h-[var(--radix-popover-content-available-height)] overflow-y-auto";

/** A color of the code, in the editor's paint picker (fills and contrast check). */
function PaintField({
  name,
  label,
  value,
  fallback,
  onChange,
  children,
}: {
  name: "bgColor" | "fgColor" | "eyeColor" | "dotColor";
  label: string;
  value: ColorConfig | undefined;
  fallback: string;
  onChange: (color: ColorConfig) => void;
  /** Shown under the picker (a note, a reset) */
  children?: ReactNode;
}) {
  return (
    <section aria-label={label} className="space-y-3">
      <PaintPanel
        fallback={fallback}
        kinds={QR_IMAGE_KINDS}
        onChange={onChange}
        role={roleOf(name)}
        value={value}
      />
      {children}
    </section>
  );
}

function paintTrigger(value: ColorConfig | undefined, fallback: string) {
  return (
    <>
      <Paintbucket aria-hidden className={icon} />
      <Swatch color={paintBackground(value, fallback)} />
    </>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted-foreground text-xs text-pretty">{children}</p>
  );
}

/** The level the code is drawn at: a big logo can raise it (autoLevel). */
function drawnErrorLevel(style: QRStyle, value: string) {
  const options = styleEngineOptions(style);
  const data = getQRData({
    value,
    level: style.level,
    margin: style.margin,
    hideLogo: !style.showLogo,
    logo: style.customLogo ?? DEFAULT_QR_LOGO,
    ...options,
  });
  return resolveErrorLevel({
    value: data.value,
    size: data.size,
    level: data.level,
    margin: data.margin,
    imageSettings: data.imageSettings,
    autoLevel: options.autoLevel,
    shape: options.shape,
  });
}

/** Error correction, the logo's automatic raise, and what's drawn. */
function ErrorCorrectionMenu({
  style,
  update,
}: {
  /** The style with defaults filled in */
  style: QRStyle;
  update: (change: Partial<QRStyle>) => void;
}) {
  const t = useTranslations("editor.partInline.errorCorrection");
  const value = useEditorValue();
  const drawn = useMemo(
    () => (value.trim() ? drawnErrorLevel(style, value) : style.level),
    [style, value],
  );
  return (
    <div className="space-y-4">
      <ErrorLevelControl />
      {style.showLogo && <AutoLevelControl onChange={update} style={style} />}
      {drawn && drawn !== style.level && (
        <Note>{t("theLogoRaisesItToLevel", { level: drawn })}</Note>
      )}
    </div>
  );
}

const CODE_SHAPES = ["square", "circle", "heart"] as const;

/** Square, circle or heart: the outline the code is drawn in (`shape`). */
function CodeShapeMenu({
  style,
  update,
}: {
  style: QRStyle;
  update: (change: Partial<QRStyle>) => void;
}) {
  const t = useTranslations("editor.partInline.codeShape");
  const current = style.silhouette
    ? null
    : style.shape === "circle" || style.shape === "heart"
      ? style.shape
      : "square";
  const pick = (id: (typeof CODE_SHAPES)[number]) => {
    soundEvent("tick");
    // A shaped code takes the place of a frame (frame-shapes.tsx)
    update(
      id === "square"
        ? { shape: undefined, silhouette: undefined }
        : {
            shape: id,
            silhouette: undefined,
            frame: undefined,
            templateId: undefined,
          },
    );
  };
  return (
    <div className="space-y-3">
      <OptionGrid columns={3} label={t("codeShape")}>
        {CODE_SHAPES.map((id) => (
          <CompactTile
            key={id}
            name={t(`names.${id}`)}
            onSelect={() => pick(id)}
            selected={current === id}
          >
            <QRCodeSVG
              bgColor="#ffffff"
              bodyPattern="square"
              cornerEyeDotPattern="square"
              cornerEyePattern="square"
              fgColor="#000000"
              {...(id !== "square" && { shape: id })}
              size={40}
              style={{ maxHeight: "100%", maxWidth: "100%" }}
              value={CANONICAL_HOST}
            />
          </CompactTile>
        ))}
      </OptionGrid>
      <Note>{t("aCircleOrHeartTakes")}</Note>
    </div>
  );
}

/**
 * The items of `part`'s toolbar for `style` (the design as stored, defaults
 * not filled in). `update` merges a change into the design.
 */
export function usePartItems(
  part: PartId,
  style: QRStyle,
  update: (change: Partial<QRStyle>) => void,
  context: PartItemsContext,
): { items: PartItem[]; extra: ReactNode } {
  const t = useTranslations("editor.partInline.items");
  const current: QRStyle = { ...defaultThemeState.styles, ...style };
  const upload = useLogoUpload((logo) =>
    update({ customLogo: logo, showLogo: true }),
  );
  // The logo's size as drawn (capped to what the code can repair)
  const logoSize = useLogoSize(current).shown;

  if (part === "eyes") {
    const { eye, eyeScope } = context;
    const one = eyeScope === "one";
    const own = current.eyeColors?.[eye];
    const outer = one
      ? eyeOuterColor(current, eye)
      : (current.eyeColor ?? current.fgColor);
    const inner = one
      ? eyeInnerColor(current, eye)
      : (current.dotColor ?? outer);
    const shared = one ? <Note>{t("shapesChangeAllThreeEyes")}</Note> : null;
    const sameAsOthers =
      one && (own?.outer || own?.inner) ? (
        <Button
          onClick={() =>
            update({ eyeColors: withoutEyeColor(current.eyeColors, eye) })
          }
          size="sm"
          type="button"
          variant="outline"
        >
          <RefreshLeftSquare aria-hidden className={icon} />
          {t("sameAsTheOthers")}
        </Button>
      ) : !one && hasEyeColors(current) ? (
        <Note>{t("eyesWithTheirOwnColor")}</Note>
      ) : null;
    const setColor = (which: "outer" | "inner", color: ColorConfig) =>
      update(
        one
          ? { eyeColors: withEyeColor(current.eyeColors, eye, which, color) }
          : which === "outer"
            ? { eyeColor: color }
            : { dotColor: color },
      );
    return {
      extra: null,
      items: [
        {
          kind: "segment",
          id: "eye-scope",
          label: t("whichEyes"),
          options: [
            { id: "all", label: t("allEyes") },
            { id: "one", label: t("thisEye") },
          ],
          value: eyeScope,
          onChange: (id) => context.onEyeScope(id as EyeScope),
        },
        {
          kind: "menu",
          id: "outer",
          label: t("outerShape"),
          trigger: <Scan aria-hidden className={icon} />,
          className: SHAPE_MENU,
          content: (
            <>
              <EyeOuterShapeControl />
              {shared}
            </>
          ),
        },
        {
          kind: "menu",
          id: "centre",
          label: t("centerShape"),
          trigger: <RecordCircle aria-hidden className={icon} />,
          className: SHAPE_MENU,
          content: (
            <>
              <EyeCentreShapeControl />
              {shared}
            </>
          ),
        },
        {
          kind: "menu",
          id: "eye-color",
          label: one ? t("thisEyesColor") : t("eyeColor"),
          trigger: paintTrigger(outer, "#000000"),
          className: PAINT_MENU,
          content: (
            <PaintField
              fallback="#000000"
              label={t("eyeColor")}
              name="eyeColor"
              onChange={(color) => setColor("outer", color)}
              value={outer}
            >
              {sameAsOthers}
            </PaintField>
          ),
        },
        {
          kind: "menu",
          id: "centre-color",
          label: one ? t("thisEyesCenterColor") : t("centerColor"),
          trigger: paintTrigger(inner, "#000000"),
          className: PAINT_MENU,
          content: (
            <PaintField
              fallback="#000000"
              label={t("centerColor")}
              name="dotColor"
              onChange={(color) => setColor("inner", color)}
              value={inner}
            >
              {sameAsOthers}
            </PaintField>
          ),
        },
      ],
    };
  }

  if (part === "dots") {
    return {
      extra: null,
      items: [
        {
          kind: "menu",
          id: "pattern",
          label: t("pattern"),
          trigger: <Element3 aria-hidden className={icon} />,
          className: SHAPE_MENU,
          content: <DotPatternControl />,
        },
        {
          kind: "menu",
          id: "dot-color",
          label: t("dotColor"),
          trigger: paintTrigger(current.fgColor, "#000000"),
          className: PAINT_MENU,
          content: (
            <PaintField
              fallback="#000000"
              label={t("dotColor")}
              name="fgColor"
              onChange={(color) => update({ fgColor: color })}
              value={current.fgColor}
            />
          ),
        },
        {
          kind: "menu",
          id: "dot-size",
          label: t("dotSize"),
          trigger: (
            <>
              <Size aria-hidden className={icon} />
              <span className="tabular-nums">{dotSize(current).value}%</span>
            </>
          ),
          className: SLIDER_MENU,
          content: (
            <DotSizeControl
              onChange={(moduleScale) => update({ moduleScale })}
              style={current}
            />
          ),
        },
      ],
    };
  }

  if (part === "logo") {
    const shown = current.showLogo ?? false;
    const setOptions = (change: Parameters<typeof logoOptionsChange>[1]) =>
      update(logoOptionsChange(current.logoOptions ?? {}, change));
    return {
      // The file input the Upload tile opens (outside the menu, so it
      // survives the menu closing)
      extra: upload.input,
      items: [
        {
          kind: "menu",
          id: "logo",
          label: t("logo"),
          trigger: <Gallery aria-hidden className={icon} />,
          className: "w-72",
          content: (
            <div>
              <OptionGroupLabel>{t("quickIcons")}</OptionGroupLabel>
              <LogoPresets
                active={shown}
                logo={current.customLogo}
                onPick={(logo) => update({ customLogo: logo, showLogo: true })}
                onUpload={upload.choose}
              />
            </div>
          ),
        },
        {
          kind: "menu",
          id: "logo-size",
          label: t("logoSize"),
          trigger: (
            <>
              <Size aria-hidden className={icon} />
              <span className="tabular-nums">{logoSize}%</span>
            </>
          ),
          className: SLIDER_MENU,
          content: <LogoSizeControl onChange={update} style={current} />,
        },
        {
          kind: "menu",
          id: "logo-shape",
          label: t("logoShapeAndPlate"),
          trigger: <Crop aria-hidden className={icon} />,
          className: LIST_MENU,
          content: (
            <LogoCropControls
              onChange={update}
              setOptions={setOptions}
              style={current}
            />
          ),
        },
        {
          kind: "menu",
          id: "clear-space",
          label: t("clearSpace"),
          trigger: (
            <>
              <Maximize4 aria-hidden className={icon} />
              <span className="tabular-nums">
                {current.logoOptions?.padding ?? 0}
              </span>
            </>
          ),
          className: SLIDER_MENU,
          content: <LogoClearSpaceControl onChange={update} style={current} />,
        },
        {
          kind: "toggle",
          id: "hide-logo",
          label: t("hideLogo"),
          trigger: shown ? (
            <EyeSlash aria-hidden className={icon} />
          ) : (
            <Eye aria-hidden className={icon} />
          ),
          pressed: !shown,
          onToggle: () => update({ showLogo: !shown }),
        },
      ],
    };
  }

  if (part === "background") {
    return {
      extra: null,
      items: [
        {
          kind: "menu",
          id: "content",
          label: t("content"),
          trigger: <DocumentText aria-hidden className={icon} />,
          className: "w-80",
          content: <ContentField onOpenContent={context.onOpenContent} />,
        },
        {
          kind: "menu",
          id: "background-color",
          label: t("backgroundColor"),
          trigger: paintTrigger(current.bgColor, "#ffffff"),
          className: PAINT_MENU,
          content: (
            <PaintField
              fallback="#ffffff"
              label={t("backgroundColor")}
              name="bgColor"
              onChange={(color) => update({ bgColor: color })}
              value={current.bgColor}
            />
          ),
        },
        {
          kind: "menu",
          id: "code-shape",
          label: t("codeShape"),
          trigger: <Shapes aria-hidden className={icon} />,
          className: SLIDER_MENU,
          content: <CodeShapeMenu style={current} update={update} />,
        },
        {
          kind: "menu",
          id: "padding",
          label: t("padding"),
          trigger: (
            <>
              <Maximize4 aria-hidden className={icon} />
              <span className="tabular-nums">{current.margin ?? 0}</span>
            </>
          ),
          className: SLIDER_MENU,
          content: (
            <PaddingControls
              onChange={(margin) => update({ margin })}
              value={current.margin}
            />
          ),
        },
        {
          kind: "menu",
          id: "error-correction",
          label: t("errorCorrection"),
          trigger: (
            <>
              <SecuritySafe aria-hidden className={icon} />
              <span>{current.level ?? "Q"}</span>
            </>
          ),
          className: LIST_MENU,
          content: <ErrorCorrectionMenu style={current} update={update} />,
        },
      ],
    };
  }

  // The frame
  const frame = current.frame;
  const frameColor = frame ? frameTweaks(frame).frameColor : null;
  return {
    extra: null,
    items: [
      {
        kind: "menu",
        id: "frame-style",
        label: t("frameStyle"),
        trigger: <PictureFrame aria-hidden className={icon} />,
        className: SHAPE_MENU,
        content: <FrameStylePicker />,
      },
      ...(frame && frameColor
        ? [
            {
              kind: "menu" as const,
              id: "frame-color",
              label: t("frameColor"),
              trigger: (
                <>
                  <Paintbucket aria-hidden className={icon} />
                  <Swatch color={frameColor} />
                </>
              ),
              content: (
                <ColorEditor
                  label={t("frameColor")}
                  onChange={(value) =>
                    update({
                      frame: withFrameTweak(frame, {
                        kind: "frameColor",
                        value,
                      }),
                    })
                  }
                  value={frameColor}
                />
              ),
            },
          ]
        : []),
    ],
  };
}
