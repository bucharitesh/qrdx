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
      ]
    );

    return (
      <QRCodeSVG
        bgColor={qrData.bgColor}
        bodyPattern={qrData.bodyPattern}
        cornerEyeDotPattern={cornerEyeDotPattern}
        cornerEyePattern={cornerEyePattern}
        customText={customText}
        dotColor={qrData.dotColor}
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
