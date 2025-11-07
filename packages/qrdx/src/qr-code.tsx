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
    level,
    scale = 1,
    margin = DEFAULT_MARGIN,
    templateId,
    customProps,
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
    level?: "L" | "M" | "Q" | "H";
    scale?: number;
    margin?: number;
    templateId?: string;
    customProps?: Record<string, any>;
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
          level,
          templateId,
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
        dotColor={qrData.dotColor}
        eyeColor={qrData.eyeColor}
        fgColor={qrData.fgColor}
        level={level || qrData.level}
        margin={qrData.margin}
        size={(qrData.size / 8) * scale}
        templateId={qrData.templateId}
        value={qrData.value}
        customProps={customProps}
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
