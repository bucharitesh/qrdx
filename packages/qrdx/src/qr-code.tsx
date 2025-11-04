"use client";

import { memo, useMemo } from "react";
import type {
  BodyPattern,
  CornerEyeDotPattern,
  CornerEyePattern,
} from "@/types";
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
    bodyPattern,
    cornerEyePattern,
    cornerEyeDotPattern,
    errorLevel,
    scale = 1,
    margin = DEFAULT_MARGIN,
    templateId,
    customText,
    textColor,
    fontSize,
    fontWeight,
    fontLetterSpacing,
    fontFamily,
  }: {
    url: string;
    fgColor?: string;
    hideLogo?: boolean;
    logo?: string;
    bgColor?: string;
    eyeColor?: string;
    dotColor?: string;
    bodyPattern?: BodyPattern;
    cornerEyePattern?: CornerEyePattern;
    cornerEyeDotPattern?: CornerEyeDotPattern;
    errorLevel?: "L" | "M" | "Q" | "H";
    scale?: number;
    margin?: number;
    templateId?: string;
    customText?: string;
    textColor?: string;
    fontSize?: number;
    fontWeight?: number;
    fontLetterSpacing?: number;
    fontFamily?: string;
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
          bodyPattern,
          cornerEyePattern,
          cornerEyeDotPattern,
          errorLevel,
          fontSize,
          fontWeight,
          fontLetterSpacing,
          fontFamily,
          templateId,
          customText,
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
        bodyPattern,
        cornerEyePattern,
        cornerEyeDotPattern,
        errorLevel,
        fontSize,
        fontWeight,
        fontLetterSpacing,
        fontFamily,
        templateId,
        customText,
      ]
    );

    return (
      <QRCodeSVG
        bgColor={qrData.bgColor}
        bodyPattern={qrData.bodyPattern}
        cornerEyeDotPattern={qrData.cornerEyeDotPattern}
        cornerEyePattern={qrData.cornerEyePattern}
        customText={customText}
        dotColor={qrData.dotColor}
        eyeColor={qrData.eyeColor}
        fgColor={qrData.fgColor}
        fontFamily={fontFamily}
        fontLetterSpacing={qrData.fontLetterSpacing}
        fontSize={qrData.fontSize}
        fontWeight={qrData.fontWeight}
        level={errorLevel || qrData.level}
        margin={qrData.margin}
        size={(qrData.size / 8) * scale}
        templateId={qrData.templateId}
        textColor={textColor}
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
