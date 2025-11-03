"use client";

import { memo, useMemo } from "react";
import { DEFAULT_MARGIN } from "./constants";
import { getQRData, QRCodeSVG } from "./index";

export const QRCode = memo(
  ({
    url,
    fgColor,
    hideLogo,
    logo,
    bgColor,
    eyeColor,
    dotColor,
    scale = 1,
    margin = DEFAULT_MARGIN,
    templateId,
    customText,
    fontSize,
    fontWeight,
    fontLetterSpacing,
  }: {
    url: string;
    fgColor?: string;
    hideLogo?: boolean;
    logo?: string;
    bgColor?: string;
    eyeColor?: string;
    dotColor?: string;
    scale?: number;
    margin?: number;
    templateId?: string;
    customText?: string;
    textColor?: string;
    fontSize?: number;
    fontWeight?: number;
    fontLetterSpacing?: number;
  }) => {
    const qrData = useMemo(
      () =>
        getQRData({
          url,
          fgColor,
          hideLogo,
          bgColor,
          eyeColor,
          dotColor,
          logo,
          margin,
        }),
      [url, fgColor, hideLogo, logo, margin, bgColor, eyeColor, dotColor]
    );

    return (
      <QRCodeSVG
        bgColor={qrData.bgColor}
        customText={customText}
        dotColor={qrData.dotColor}
        eyeColor={qrData.eyeColor}
        fgColor={qrData.fgColor}
        fontLetterSpacing={fontLetterSpacing}
        fontSize={fontSize}
        fontWeight={fontWeight}
        level={qrData.level}
        margin={qrData.margin}
        size={(qrData.size / 8) * scale}
        templateId={templateId}
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
