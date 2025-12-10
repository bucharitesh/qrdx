import type { QRPropsSVG } from "../types";
import qrcodegen from "./codegen";
import {
  DEFAULT_BGCOLOR,
  DEFAULT_FGCOLOR,
  DEFAULT_LEVEL,
  DEFAULT_MARGIN,
  DEFAULT_SIZE,
  ERROR_LEVEL_MAP,
} from "./constants";
import { excavateModules, generatePath, getImageSettings } from "./utils";
import { getSolidColor } from "./utils/color";

export async function getQRAsSVG(props: QRPropsSVG) {
  const {
    value,
    size = DEFAULT_SIZE,
    level = DEFAULT_LEVEL,
    bgColor = DEFAULT_BGCOLOR,
    fgColor = DEFAULT_FGCOLOR,
    margin = DEFAULT_MARGIN,
    imageSettings,
    ...otherProps
  } = props;

  let cells = qrcodegen.QrCode.encodeText(
    value,
    ERROR_LEVEL_MAP[level]
  ).getModules();

  const numCells = cells.length + margin * 2;
  const calculatedImageSettings = getImageSettings(
    cells,
    size,
    margin,
    imageSettings
  );

  let image = <></>;
  if (imageSettings != null && calculatedImageSettings != null) {
    if (calculatedImageSettings.excavation != null) {
      cells = excavateModules(cells, calculatedImageSettings.excavation);
    }

    const base64Image = await fetch(
      `https://wsrv.nl/?url=${imageSettings.src}&w=100&h=100&encoding=base64`
    ).then((res) => res.text());

    image = (
      <image
        height={calculatedImageSettings.h}
        href={base64Image}
        preserveAspectRatio="none"
        width={calculatedImageSettings.w}
        x={calculatedImageSettings.x + margin}
        y={calculatedImageSettings.y + margin}
      />
    );
  }

  // Drawing strategy: instead of a rect per module, we're going to create a
  // single path for the dark modules and layer that on top of a light rect,
  // for a total of 2 DOM nodes. We pay a bit more in string concat but that's
  // way faster than DOM ops.
  // For level 1, 441 nodes -> 2
  // For level 40, 31329 -> 2
  const fgPath = generatePath(cells, margin);

  return (
    <svg
      height={size}
      viewBox={`0 0 ${numCells} ${numCells}`}
      width={size}
      xmlns="http://www.w3.org/2000/svg"
      {...otherProps}
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
}
