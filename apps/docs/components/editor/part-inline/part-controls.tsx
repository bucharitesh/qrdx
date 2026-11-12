"use client";

import {
  Element3,
  Eye,
  EyeSlash,
  Gallery,
  Maximize4,
  Paintbucket,
  PictureFrame,
  RecordCircle,
  Scan,
  Size,
} from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import type { ColorConfig } from "qrdx/types";
import type { ReactNode } from "react";
import { defaultThemeState } from "@/config/qr";
import { roleOf } from "@/lib/paint/contrast";
import type { QRStyle } from "@/types/theme";
import { DotSizeControl, dotSize } from "../control-sections/dot-size-section";
import { FrameStylePicker } from "../control-sections/frame-controls";
import { useLogoUpload } from "../control-sections/logo-controls";
import {
  LogoSizeControl,
  useLogoSize,
} from "../control-sections/logo-options-section";
import { LogoPresets } from "../control-sections/logo-presets";
import { OptionGroupLabel } from "../control-sections/option-tiles";
import { PaddingControls } from "../control-sections/padding-controls";
import {
  DotPatternControl,
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

export type PartItem = PartMenuItem | PartToggleItem;

const icon = "size-4";
const SHAPE_MENU =
  "w-[19rem] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto";
const PAINT_MENU =
  "w-[18.5rem] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto";
const SLIDER_MENU = "w-72";

/** A color of the code, in the editor's paint picker (fills and contrast check). */
function PaintField({
  name,
  label,
  value,
  fallback,
  onChange,
}: {
  name: "bgColor" | "fgColor" | "eyeColor" | "dotColor";
  label: string;
  value: ColorConfig | undefined;
  fallback: string;
  onChange: (color: ColorConfig) => void;
}) {
  return (
    <section aria-label={label}>
      <PaintPanel
        fallback={fallback}
        kinds={QR_IMAGE_KINDS}
        onChange={onChange}
        role={roleOf(name)}
        value={value}
      />
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

/**
 * The items of `part`'s toolbar for `style` (the design as stored, defaults
 * not filled in). `update` merges a change into the design.
 */
export function usePartItems(
  part: PartId,
  style: QRStyle,
  update: (change: Partial<QRStyle>) => void,
): { items: PartItem[]; extra: ReactNode } {
  const t = useTranslations("editor.partInline.items");
  const current: QRStyle = { ...defaultThemeState.styles, ...style };
  const upload = useLogoUpload((logo) =>
    update({ customLogo: logo, showLogo: true }),
  );
  // The logo's size as drawn (capped to what the code can repair)
  const logoSize = useLogoSize(current).shown;

  if (part === "eyes") {
    const eyeColor = current.eyeColor ?? current.fgColor;
    const centreColor = current.dotColor ?? eyeColor;
    return {
      extra: null,
      items: [
        {
          kind: "menu",
          id: "outer",
          label: t("outerShape"),
          trigger: <Scan aria-hidden className={icon} />,
          className: SHAPE_MENU,
          content: <EyeOuterShapeControl />,
        },
        {
          kind: "menu",
          id: "centre",
          label: t("centerShape"),
          trigger: <RecordCircle aria-hidden className={icon} />,
          className: SHAPE_MENU,
          content: <EyeCentreShapeControl />,
        },
        {
          kind: "menu",
          id: "eye-color",
          label: t("eyeColor"),
          trigger: paintTrigger(eyeColor, "#000000"),
          className: PAINT_MENU,
          content: (
            <PaintField
              fallback="#000000"
              label={t("eyeColor")}
              name="eyeColor"
              onChange={(color) => update({ eyeColor: color })}
              value={eyeColor}
            />
          ),
        },
        {
          kind: "menu",
          id: "centre-color",
          label: t("centerColor"),
          trigger: paintTrigger(centreColor, "#000000"),
          className: PAINT_MENU,
          content: (
            <PaintField
              fallback="#000000"
              label={t("centerColor")}
              name="dotColor"
              onChange={(color) => update({ dotColor: color })}
              value={centreColor}
            />
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
