"use client";

import { getQRData, QRCodeSVG } from "./index";
import { DEFAULT_MARGIN } from "./constants";
import { memo, useMemo } from "react";

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
    }) => {
        const qrData = useMemo(
            () => getQRData({ url, fgColor, hideLogo, bgColor, eyeColor, dotColor, logo, margin }),
            [url, fgColor, hideLogo, logo, margin, bgColor, eyeColor, dotColor]
        );

        return (
            <QRCodeSVG
                value={qrData.value}
                size={(qrData.size / 8) * scale}
                bgColor={qrData.bgColor}
                fgColor={qrData.fgColor}
                eyeColor={qrData.eyeColor}
                dotColor={qrData.dotColor}
                level={qrData.level}
                margin={qrData.margin}
                templateId={templateId}
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
