import { QRCodeSVG } from "qrdx";
import type {
  BodyPattern,
  CornerEyeDotPattern,
  CornerEyePattern,
} from "qrdx/types";

// Thumbnails drawn by the real renderer, for patterns without a hand-drawn
// icon. A version-1 code is drawn at 10px per module and cropped with the
// outer viewBox: a window of data modules for bodies, the top-left finder for
// eyes and eye dots (the part not being picked is shown in light grey, like
// the hand-drawn icons).

const SAMPLE = "https://qrdx.dev";
const MODULE = 10;
const SIZE = 21 * MODULE;
const GREY = "#DDDDDD";

type SwatchProps = React.SVGProps<SVGSVGElement>;

function Crop({
  viewBox,
  children,
  ...props
}: SwatchProps & { viewBox: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox={viewBox}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {children}
    </svg>
  );
}

export function BodyPatternSwatch({
  pattern,
  ...props
}: SwatchProps & { pattern: BodyPattern }) {
  return (
    <Crop
      viewBox={`${8 * MODULE} ${8 * MODULE} ${10 * MODULE} ${10 * MODULE}`}
      {...props}
    >
      <QRCodeSVG
        bgColor="transparent"
        bodyPattern={pattern}
        cornerEyeDotPattern="square"
        cornerEyePattern="square"
        fgColor="#000000"
        level="L"
        margin={0}
        size={SIZE}
        value={SAMPLE}
      />
    </Crop>
  );
}

export function EyePatternSwatch({
  pattern,
  ...props
}: SwatchProps & { pattern: CornerEyePattern }) {
  return (
    <Crop
      viewBox={`${-MODULE / 2} ${-MODULE / 2} ${8 * MODULE} ${8 * MODULE}`}
      {...props}
    >
      <QRCodeSVG
        bgColor="transparent"
        bodyPattern="square"
        cornerEyeDotPattern="square"
        cornerEyePattern={pattern}
        dotColor={GREY}
        eyeColor="#000000"
        fgColor="#000000"
        level="L"
        margin={0}
        size={SIZE}
        value={SAMPLE}
      />
    </Crop>
  );
}

export function EyeDotPatternSwatch({
  pattern,
  ...props
}: SwatchProps & { pattern: CornerEyeDotPattern }) {
  return (
    <Crop
      viewBox={`${-MODULE / 2} ${-MODULE / 2} ${8 * MODULE} ${8 * MODULE}`}
      {...props}
    >
      <QRCodeSVG
        bgColor="transparent"
        bodyPattern="square"
        cornerEyeDotPattern={pattern}
        cornerEyePattern="square"
        dotColor="#000000"
        eyeColor={GREY}
        fgColor="#000000"
        level="L"
        margin={0}
        size={SIZE}
        value={SAMPLE}
      />
    </Crop>
  );
}
