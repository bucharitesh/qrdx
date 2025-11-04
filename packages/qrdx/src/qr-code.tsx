"use client";

import { memo, useMemo } from "react";
import { DEFAULT_MARGIN } from "./constants";
import { getQRData } from "./helpers";
import { QRCodeSVG } from "./utils";

export const QRCode = memo(
  ({
    url,
    fgColor,
    hideLogo,
    logo,
    bgColor,
    eyeColor,
    dotColor,
    dotPattern,
    cornerEyePattern,
    cornerEyeDotPattern,
    errorLevel,
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
    dotPattern?:
      | "circle"
      | "square"
      | "diamond"
      | "circle-mixed"
      | "packman"
      | "rounded"
      | "clean-square";
    cornerEyePattern?:
      | "square"
      | "rounded"
      | "rounded-inward"
      | "rounded-inward-flipped"
      | "gear"
      | "semi-round"
      | "rounded-extra"
      | "rounded-square"
      | "circle";
    cornerEyeDotPattern?:
      | "square"
      | "rounded-square"
      | "circle"
      | "rounded-inward"
      | "rounded-inward-flipped"
      | "semi-round"
      | "leaf"
      | "diamond"
      | "diamond-rounded";
    errorLevel?: "L" | "M" | "Q" | "H";
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
          dotPattern,
          logo,
          margin,
        }),
      [
        url,
        fgColor,
        hideLogo,
        logo,
        margin,
        bgColor,
        eyeColor,
        dotColor,
        dotPattern,
      ]
    );

    return (
      <QRCodeSVG
        bgColor={qrData.bgColor}
        cornerEyeDotPattern={cornerEyeDotPattern}
        cornerEyePattern={cornerEyePattern}
        customText={customText}
        dotColor={qrData.dotColor}
        dotPattern={qrData.dotPattern}
        eyeColor={qrData.eyeColor}
        fgColor={qrData.fgColor}
        fontLetterSpacing={fontLetterSpacing}
        fontSize={fontSize}
        fontWeight={fontWeight}
        level={errorLevel || qrData.level}
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
