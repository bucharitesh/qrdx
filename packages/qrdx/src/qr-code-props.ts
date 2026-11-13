// QRCode's simpler logo API (`logo`, `logoOptions`, `hideLogo`, `scale`)
// resolved into the props QRCodeSVG draws with. The React component and the
// framework adapters share it, so a `<QRCode>` draws the same everywhere.
import type { LogoOptions, QRProps, QRSVGOptions } from "../types";
import { DEFAULT_MARGIN, DEFAULT_SIZE } from "./constants";
import { getQRData } from "./helpers";

/** `QRCode`'s props: `QRProps` plus the logo API. */
export interface QRCodeProps extends QRProps {
  hideLogo?: boolean;
  logo?: string;
  /** Size, clear space and position of `logo` (see `LogoOptions`) */
  logoOptions?: LogoOptions;
  scale?: number;
}

type QRData = ReturnType<typeof getQRData>;

/** What `getQRData` lays out for `QRCode`'s props. */
export function getQRCodeData(props: QRCodeProps): QRData {
  return getQRData({
    value: props.value,
    fgColor: props.fgColor,
    hideLogo: props.hideLogo,
    bgColor: props.bgColor,
    eyeColor: props.eyeColor,
    dotColor: props.dotColor,
    bodyPattern: props.bodyPattern,
    cornerEyePattern: props.cornerEyePattern,
    cornerEyeDotPattern: props.cornerEyeDotPattern,
    level: props.level,
    templateId: props.templateId,
    logo: props.logo,
    logoOptions: props.logoOptions,
    margin: props.margin ?? DEFAULT_MARGIN,
    autoLevel: props.autoLevel,
    shape: props.shape,
  });
}

/** The `QRCodeSVG` props `QRCode` draws with, given its laid-out data. */
export function getQRCodeSVGProps(
  props: QRCodeProps,
  qrData: QRData
): QRSVGOptions {
  const {
    size = DEFAULT_SIZE,
    scale = 1,
    level,
    style,
    customTemplate,
    customProps,
    frame,
    art,
    eyeColors,
    moduleScale,
    autoLevel,
    shape,
    frameLabelMarkers,
    partMarkers,
  } = props;
  // getQRData lays the logo out on a 1024px canvas; scale it to the rendered size.
  const renderSize = size * scale;
  // Pixels of the 1024px layout → pixels of the rendered code
  const ratio = renderSize / qrData.size;
  const logoSettings = qrData.imageSettings && {
    ...qrData.imageSettings,
    height: qrData.imageSettings.height * ratio,
    width: qrData.imageSettings.width * ratio,
    ...(qrData.imageSettings.x != null && {
      x: qrData.imageSettings.x * ratio,
    }),
    ...(qrData.imageSettings.y != null && {
      y: qrData.imageSettings.y * ratio,
    }),
    ...(qrData.imageSettings.padding != null && {
      padding: qrData.imageSettings.padding * ratio,
    }),
  };

  return {
    art,
    bgColor: qrData.bgColor,
    bodyPattern: qrData.bodyPattern,
    cornerEyeDotPattern: qrData.cornerEyeDotPattern,
    cornerEyePattern: qrData.cornerEyePattern,
    customProps,
    customTemplate,
    dotColor: qrData.dotColor,
    eyeColor: qrData.eyeColor,
    fgColor: qrData.fgColor,
    frame,
    level: level || qrData.level,
    margin: qrData.margin,
    ...(eyeColors && { eyeColors }),
    ...(moduleScale !== undefined && { moduleScale }),
    ...(autoLevel && { autoLevel }),
    ...(shape && shape !== "square" && { shape }),
    ...(frameLabelMarkers && { frameLabelMarkers }),
    ...(partMarkers && { partMarkers }),
    size: renderSize,
    style,
    templateId: qrData.templateId,
    value: qrData.value,
    ...(logoSettings && { imageSettings: logoSettings }),
  };
}

/**
 * `QRCode`'s props (with `logo`, `logoOptions`, `hideLogo` and `scale`) as
 * the props `createQRCodeTree` and `toSVGString` take: what `<QRCode>` draws.
 */
export function resolveQRCodeProps(props: QRCodeProps): QRSVGOptions {
  return getQRCodeSVGProps(props, getQRCodeData(props));
}
