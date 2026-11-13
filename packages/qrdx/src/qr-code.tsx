// memo/useMemo are available in React Server Components, so QRCode can render
// on the server; only QRCodeCanvas needs a client boundary.
import { memo, useMemo } from "react";
import { DEFAULT_MARGIN } from "./constants";
import {
  getQRCodeData,
  getQRCodeSVGProps,
  type QRCodeProps,
} from "./qr-code-props";
import { QRCodeSVG } from "./qr-code-svg";

export const QRCode = memo((props: QRCodeProps) => {
  const {
    value,
    fgColor,
    hideLogo,
    logo,
    logoOptions,
    bgColor,
    eyeColor,
    dotColor,
    bodyPattern,
    cornerEyePattern,
    cornerEyeDotPattern,
    level,
    margin = DEFAULT_MARGIN,
    templateId,
    autoLevel,
    shape,
  } = props;
  // biome-ignore lint/correctness/useExhaustiveDependencies: the layout depends on exactly these props
  const qrData = useMemo(
    () => getQRCodeData(props),
    [
      value,
      fgColor,
      hideLogo,
      logo,
      logoOptions,
      margin,
      autoLevel,
      shape,
      bgColor,
      eyeColor,
      dotColor,
      bodyPattern,
      cornerEyePattern,
      cornerEyeDotPattern,
      level,
      templateId,
    ]
  );

  return <QRCodeSVG {...getQRCodeSVGProps(props, qrData)} />;
});

QRCode.displayName = "QRCode";
