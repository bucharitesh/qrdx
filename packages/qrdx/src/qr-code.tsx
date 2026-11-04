// memo/useMemo are available in React Server Components, so QRCode can render
// on the server; only QRCodeCanvas needs a client boundary.
import { memo, useMemo } from "react";
import type { LogoOptions, QRProps } from "../types";
import { DEFAULT_MARGIN, DEFAULT_SIZE } from "./constants";
import { getQRData } from "./helpers";
import { QRCodeSVG } from "./utils";

interface QRCodeProps extends QRProps {
  hideLogo?: boolean;
  logo?: string;
  /** Size, clear space and position of `logo` (see `LogoOptions`) */
  logoOptions?: LogoOptions;
  scale?: number;
}

export const QRCode = memo(
  ({
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
    size = DEFAULT_SIZE,
    scale = 1,
    margin = DEFAULT_MARGIN,
    style,
    templateId,
    customTemplate,
    customProps,
    frame,
    art,
    eyeColors,
    moduleScale,
    autoLevel,
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
          logoOptions,
          margin,
          autoLevel,
        }),
      [
        value,
        fgColor,
        hideLogo,
        logo,
        logoOptions,
        margin,
        autoLevel,
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
        {...(eyeColors && { eyeColors })}
        {...(moduleScale !== undefined && { moduleScale })}
        {...(autoLevel && { autoLevel })}
        size={renderSize}
        style={style}
        templateId={qrData.templateId}
        value={qrData.value}
        {...(logoSettings && { imageSettings: logoSettings })}
      />
    );
  }
);

QRCode.displayName = "QRCode";
