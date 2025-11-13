"use client";

import { memo, useMemo } from "react";
import type { QRProps } from "../types";
import { DEFAULT_MARGIN } from "./constants";
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
    scale = 1,
    margin = DEFAULT_MARGIN,
    templateId,
    customTemplate,
    customProps,
  }: QRCodeProps) => {
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
        bgColor={qrData.bgColor}
        bodyPattern={qrData.bodyPattern}
        cornerEyeDotPattern={qrData.cornerEyeDotPattern}
        cornerEyePattern={qrData.cornerEyePattern}
        customProps={customProps}
        customTemplate={customTemplate}
        dotColor={qrData.dotColor}
        eyeColor={qrData.eyeColor}
        fgColor={qrData.fgColor}
        level={level || qrData.level}
        margin={qrData.margin}
        size={(qrData.size / 8) * scale}
        templateId={qrData.templateId}
        value={qrData.value}
        {...(qrData.imageSettings && {
          imageSettings: {
            ...qrData.imageSettings,
            height: qrData.imageSettings
              ? (qrData.imageSettings.height / 8) * scale
              : 0,
            width: qrData.imageSettings
              ? (qrData.imageSettings.width / 8) * scale
              : 0,
          },
        })}
      />
    );
  }
);

QRCode.displayName = "QRCode";
