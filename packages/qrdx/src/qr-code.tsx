"use client";

import { memo, useMemo } from "react";
import type { QRProps, ImageSettings, LogoSettings } from "../types";
import { DEFAULT_MARGIN } from "./constants";
import { getQRData } from "./helpers";
import { QRCodeSVG } from "./utils";

interface BaseQRCodeProps {
  hideLogo?: boolean;
  logo?: string;
  scale?: number;
  value: string;
  size?: number;
  fgColor?: any;
  bgColor?: any;
  eyeColor?: any;
  dotColor?: any;
  bodyPattern?: any;
  cornerEyePattern?: any;
  cornerEyeDotPattern?: any;
  level?: any;
  margin?: number;
  templateId?: string;
  customTemplate?: any;
  customProps?: any;
}

type QRCodeProps = BaseQRCodeProps &
  (
    | { type?: "default"; imageSettings?: ImageSettings; logoSettings?: never }
    | { type: "logo_qr"; logoSettings: LogoSettings; imageSettings?: never }
  );

export const QRCode = memo(
  (props: QRCodeProps) => {
    const {
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
      type,
      imageSettings,
      logoSettings,
    } = props;

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
          type,
          imageSettings,
          logoSettings,
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
        type,
        imageSettings,
        logoSettings,
      ]
    );

    // Scale image settings if present (default QR)
    const scaledImageSettings =
      qrData.type === "default" && qrData.imageSettings
        ? {
            ...qrData.imageSettings,
            height: (qrData.imageSettings.height / 8) * scale,
            width: (qrData.imageSettings.width / 8) * scale,
          }
        : undefined;

    // Build props for QRCodeSVG
    const svgProps = {
      bgColor: qrData.bgColor,
      bodyPattern: qrData.bodyPattern,
      cornerEyeDotPattern: qrData.cornerEyeDotPattern,
      cornerEyePattern: qrData.cornerEyePattern,
      customProps: customProps,
      customTemplate: customTemplate,
      dotColor: qrData.dotColor,
      eyeColor: qrData.eyeColor,
      fgColor: qrData.fgColor,
      level: level || qrData.level,
      margin: qrData.margin,
      size: (qrData.size / 8) * scale,
      templateId: qrData.templateId,
      value: qrData.value,
    };

    if (qrData.type === "logo_qr") {
      return (
        <QRCodeSVG
          {...svgProps}
          type="logo_qr"
          logoSettings={qrData.logoSettings}
        />
      );
    }

    return (
      <QRCodeSVG
        {...svgProps}
        type="default"
        imageSettings={scaledImageSettings}
      />
    );
  }
);

QRCode.displayName = "QRCode";
