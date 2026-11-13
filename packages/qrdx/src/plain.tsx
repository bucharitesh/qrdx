/** @jsxImportSource ./jsx */
// The plain renderer behind getQRAsSVG: one path for the dark modules on a
// background rect, an optional logo and frame, and no styling. Split in two
// so the React entry can draw the same tree with React's elements.
import type { ImageSettings, QRSVGOptions } from "../types";
import qrcodegen from "./codegen";
import {
  DEFAULT_BGCOLOR,
  DEFAULT_FGCOLOR,
  DEFAULT_LEVEL,
  DEFAULT_MARGIN,
  DEFAULT_SIZE,
  ERROR_LEVEL_MAP,
} from "./constants";
import { isFrameActive, wrapWithFrame } from "./frame";
import type { QRNode } from "./jsx/runtime";
import { renderLogo } from "./logo";
import { capImageSettings } from "./logo-budget";
import {
  excavateModules,
  generatePath,
  getImageSettings,
  resolveErrorLevel,
} from "./utils";
import { getSolidColor } from "./utils/color";

/** What `drawPlainQRCode` draws: everything loaded and laid out. */
export interface PlainQRCode {
  size: number;
  numCells: number;
  fgPath: string;
  bgColor: QRSVGOptions["bgColor"];
  fgColor: QRSVGOptions["fgColor"];
  frame: QRSVGOptions["frame"];
  /** Attributes for the root <svg> (the frame's, with a frame) */
  svgProps: Record<string, unknown>;
  /** The capped logo, its src loaded as a data URL, and its box */
  logo: {
    settings: ImageSettings;
    box: Parameters<typeof renderLogo>[1];
  } | null;
}

/** Lays the code out and loads its logo (see `getQRAsSVGNode`). */
export async function preparePlainQRCode(
  props: QRSVGOptions
): Promise<PlainQRCode> {
  const {
    value,
    size = DEFAULT_SIZE,
    level = DEFAULT_LEVEL,
    bgColor = DEFAULT_BGCOLOR,
    fgColor = DEFAULT_FGCOLOR,
    margin = DEFAULT_MARGIN,
    imageSettings: requestedImageSettings,
    // Styling props this plain renderer does not support; keep them off <svg>.
    eyeColor: _eyeColor,
    dotColor: _dotColor,
    bodyPattern: _bodyPattern,
    cornerEyePattern: _cornerEyePattern,
    cornerEyeDotPattern: _cornerEyeDotPattern,
    isOGContext: _isOGContext,
    templateId: _templateId,
    customTemplate: _customTemplate,
    customProps: _customProps,
    frame,
    art: _art,
    eyeColors: _eyeColors,
    moduleScale: _moduleScale,
    frameLabelMarkers: _frameLabelMarkers,
    partMarkers: _partMarkers,
    autoLevel,
    ...otherProps
  } = props;
  // A logo no bigger than the code can repair (logo-budget.ts)
  const imageSettings = capImageSettings(
    { value, size, margin, level, autoLevel },
    requestedImageSettings
  );
  const effectiveLevel = resolveErrorLevel({
    value,
    size,
    level,
    margin,
    imageSettings,
    autoLevel,
  });

  let cells = qrcodegen.QrCode.encodeText(
    value,
    ERROR_LEVEL_MAP[effectiveLevel]
  ).getModules();

  const numCells = cells.length + margin * 2;
  const calculatedImageSettings = getImageSettings(
    cells,
    size,
    margin,
    imageSettings
  );

  let logo: PlainQRCode["logo"] = null;
  if (imageSettings != null && calculatedImageSettings != null) {
    if (calculatedImageSettings.excavation != null) {
      cells = excavateModules(cells, calculatedImageSettings.excavation);
    }

    const base64Image = imageSettings.src.startsWith("data:")
      ? imageSettings.src
      : await fetch(
          `https://wsrv.nl/?url=${encodeURIComponent(imageSettings.src)}&w=100&h=100&encoding=base64`
        ).then((res) => {
          if (!res.ok) {
            throw new Error(
              `Failed to load QR logo (${res.status}): ${imageSettings.src}`
            );
          }
          return res.text();
        });

    logo = {
      settings: { ...imageSettings, src: base64Image },
      box: {
        x: calculatedImageSettings.x + margin,
        y: calculatedImageSettings.y + margin,
        w: calculatedImageSettings.w,
        h: calculatedImageSettings.h,
      },
    };
  }

  // Drawing strategy: instead of a rect per module, we're going to create a
  // single path for the dark modules and layer that on top of a light rect,
  // for a total of 2 DOM nodes. We pay a bit more in string concat but that's
  // way faster than DOM ops.
  // For level 1, 441 nodes -> 2
  // For level 40, 31329 -> 2
  const fgPath = generatePath(cells, margin);
  return {
    size,
    numCells,
    fgPath,
    bgColor,
    fgColor,
    frame,
    svgProps: otherProps,
    logo,
  };
}

/** Draws a prepared plain code (synchronous, with the current elements). */
export function drawPlainQRCode(plain: PlainQRCode): QRNode {
  const { size, numCells, fgPath, bgColor, fgColor, frame, svgProps, logo } =
    plain;
  const framed = isFrameActive(frame);
  // An empty fragment without a logo, as getQRAsSVG has always drawn
  // biome-ignore lint/complexity/noUselessFragments: keeps the element tree unchanged
  const image = logo ? renderLogo(logo.settings, logo.box) : <></>;

  const code = (
    <svg
      height={size}
      viewBox={`0 0 ${numCells} ${numCells}`}
      width={size}
      xmlns="http://www.w3.org/2000/svg"
      {...(framed ? {} : svgProps)}
    >
      <path
        d={`M0,0 h${numCells}v${numCells}H0z`}
        fill={getSolidColor(bgColor, DEFAULT_BGCOLOR)}
        shapeRendering="crispEdges"
      />
      <path
        d={fgPath}
        fill={getSolidColor(fgColor, DEFAULT_FGCOLOR)}
        shapeRendering="crispEdges"
      />
      {image}
    </svg>
  );

  return framed && frame
    ? wrapWithFrame(code, { size, frame, bgColor, svgProps })
    : code;
}

/**
 * The plain code as a tree (`getQRAsSVG` without React): one path for the
 * dark modules on a background rect, plus the logo and frame. A logo that
 * isn't a data URL is fetched as base64 through wsrv.nl first.
 */
export async function getQRAsSVGNode(props: QRSVGOptions): Promise<QRNode> {
  return drawPlainQRCode(await preparePlainQRCode(props));
}
