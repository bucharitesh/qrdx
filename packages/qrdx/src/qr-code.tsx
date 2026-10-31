// memo/useMemo are available in React Server Components, so QRCode can render
// on the server; only QRCodeCanvas needs a client boundary.
import { memo, useMemo } from "react";
import type { QRProps } from "../types";
import { DEFAULT_MARGIN, DEFAULT_SIZE } from "./constants";
import { getQRData } from "./helpers";
import { QRCodeSVG } from "./utils";

interface QRCodeProps extends QRProps {
  hideLogo?: boolean;
  logo?: string;
  scale?: number;
}

export const QRCode = memo(
  ({
    value,
    fgColor,
    hideLogo,
    logo,
    bgColor,
    eyeColor,
    dotColor,
    bodyPattern,
    cornerEyePattern,
    cornerEyeDotPattern,
    level,
    size = DEFAULT_SIZE,
    scale = 1,
    margin = DEFAULT_MARGIN,
    style,
    templateId,
    customTemplate,
    customProps,
    frame,
    art,
  }: QRCodeProps) => {
    // getQRData lays the logo out on a 1024px canvas; scale it to the rendered size.
    const renderSize = size * scale;
    const qrData = useMemo(
      () =>
        getQRData({
          value,
          fgColor,
          hideLogo,
          bgColor,
          eyeColor,
          dotColor,
          bodyPattern,
          cornerEyePattern,
          cornerEyeDotPattern,
          level,
          templateId,
          logo,
          margin,
        }),
      [
        value,
        fgColor,
        hideLogo,
        logo,
        margin,
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

    return (
      <QRCodeSVG
        art={art}
        bgColor={qrData.bgColor}
        bodyPattern={qrData.bodyPattern}
        cornerEyeDotPattern={qrData.cornerEyeDotPattern}
        cornerEyePattern={qrData.cornerEyePattern}
        customProps={customProps}
        customTemplate={customTemplate}
        dotColor={qrData.dotColor}
        eyeColor={qrData.eyeColor}
        fgColor={qrData.fgColor}
        frame={frame}
        level={level || qrData.level}
        margin={qrData.margin}
        size={renderSize}
        style={style}
        templateId={qrData.templateId}
        value={qrData.value}
        {...(qrData.imageSettings && {
          imageSettings: {
            ...qrData.imageSettings,
            height: (qrData.imageSettings.height / qrData.size) * renderSize,
            width: (qrData.imageSettings.width / qrData.size) * renderSize,
          },
        })}
      />
    );
  }
);

QRCode.displayName = "QRCode";
