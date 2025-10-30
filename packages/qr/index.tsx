"use client";

/**
 * @license qrcode.react
 * Copyright (c) Paul O'Shannessy
 * SPDX-License-Identifier: ISC
 */
import { useEffect, useRef, useState, type JSX } from "react";
import qrcodegen from "./codegen";
import {
    DEFAULT_BGCOLOR,
    DEFAULT_DOTCOLOR,
    DEFAULT_EYECOLOR,
    DEFAULT_FGCOLOR,
    DEFAULT_LEVEL,
    DEFAULT_MARGIN,
    DEFAULT_SIZE,
    ERROR_LEVEL_MAP,
} from "./constants";
import type { QRProps, QRPropsCanvas } from "./types";
import {
    SUPPORTS_PATH2D,
    excavateModules,
    generatePath,
    getImageSettings,
} from "./utils";
export * from "./templates";
export * from "./types";
export * from "./utils";

export function QRCodeCanvas(props: QRPropsCanvas) {
    const {
        value,
        size = DEFAULT_SIZE,
        level = DEFAULT_LEVEL,
        bgColor = DEFAULT_BGCOLOR,
        fgColor = DEFAULT_FGCOLOR,
        eyeColor = DEFAULT_EYECOLOR,
        dotColor = DEFAULT_DOTCOLOR,
        margin = DEFAULT_MARGIN,
        style,
        imageSettings,
        ...otherProps
    } = props;
    const imgSrc = imageSettings?.src;
    const _canvas = useRef<HTMLCanvasElement>(null);
    const _image = useRef<HTMLImageElement>(null);

    // We're just using this state to trigger rerenders when images load. We
    // Don't actually read the value anywhere. A smarter use of useEffect would
    // depend on this value.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [isImgLoaded, setIsImageLoaded] = useState(false);

    useEffect(() => {
        // Always update the canvas. It's cheap enough and we want to be correct
        // with the current state.
        if (_canvas.current != null) {
            const canvas = _canvas.current;

            const ctx = canvas.getContext("2d");
            if (!ctx) {
                return;
            }

            let cells = qrcodegen.QrCode.encodeText(
                value,
                ERROR_LEVEL_MAP[level]
            ).getModules();

            const numCells = cells.length + margin * 2;
            const calculatedImageSettings = getImageSettings(
                cells,
                size,
                margin,
                imageSettings
            );

            const image = _image.current;
            const haveImageToRender =
                calculatedImageSettings != null &&
                image !== null &&
                image.complete &&
                image.naturalHeight !== 0 &&
                image.naturalWidth !== 0;

            if (haveImageToRender) {
                if (calculatedImageSettings.excavation != null) {
                    cells = excavateModules(
                        cells,
                        calculatedImageSettings.excavation
                    );
                }
            }

            // We're going to scale this so that the number of drawable units
            // matches the number of cells. This avoids rounding issues, but does
            // result in some potentially unwanted single pixel issues between
            // blocks, only in environments that don't support Path2D.
            const pixelRatio = window.devicePixelRatio || 1;
            canvas.height = canvas.width = size * pixelRatio;
            const scale = (size / numCells) * pixelRatio;
            ctx.scale(scale, scale);

            // Draw solid background, only paint dark modules.
            ctx.fillStyle = bgColor;
            ctx.fillRect(0, 0, numCells, numCells);

            ctx.fillStyle = fgColor;
            if (SUPPORTS_PATH2D) {
                // $FlowFixMe: Path2D c'tor doesn't support args yet.
                ctx.fill(new Path2D(generatePath(cells, margin)));
            } else {
                cells.forEach(function (row, rdx) {
                    row.forEach(function (cell, cdx) {
                        if (cell) {
                            ctx.fillRect(cdx + margin, rdx + margin, 1, 1);
                        }
                    });
                });
            }

            if (haveImageToRender) {
                ctx.drawImage(
                    image,
                    calculatedImageSettings.x + margin,
                    calculatedImageSettings.y + margin,
                    calculatedImageSettings.w,
                    calculatedImageSettings.h
                );
            }
        }
    });

    // Ensure we mark image loaded as false here so we trigger updating the
    // canvas in our other effect.
    useEffect(() => {
        setIsImageLoaded(false);
    }, [imgSrc]);

    const canvasStyle = { height: size, width: size, ...style };
    let img: JSX.Element | null = null;
    if (imgSrc != null) {
        img = (
            <img
                alt="QR code"
                src={imgSrc}
                key={imgSrc}
                style={{ display: "none" }}
                onLoad={() => {
                    setIsImageLoaded(true);
                }}
                ref={_image}
            />
        );
    }
    return (
        <>
            <canvas
                style={canvasStyle}
                height={size}
                width={size}
                ref={_canvas}
                {...otherProps}
            />
            {img}
        </>
    );
}

export async function getQRAsSVGDataUri(props: QRProps) {
    // Import QRCodeSVG and render it to string
    const { QRCodeSVG } = await import("./utils");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const React = await import("react");

    // If there's an image in imageSettings, convert it to base64 first
    let updatedProps = { ...props };
    if (props.imageSettings?.src) {
        try {
            const base64Image = (await getBase64Image(
                props.imageSettings.src
            )) as string;
            updatedProps = {
                ...props,
                imageSettings: {
                    ...props.imageSettings,
                    src: base64Image,
                },
            };
        } catch (error) {
            console.error("Failed to load image for QR code:", error);
            // Continue without the image if it fails to load
        }
    }

    // Create the SVG element with all props including templateId
    const svgElement = React.createElement(QRCodeSVG, {
        ...updatedProps,
        templateId: updatedProps.templateId, // Ensure templateId is passed
    });
    const svgString = renderToStaticMarkup(svgElement);

    return `data:image/svg+xml,${encodeURIComponent(svgString)}`;
}

const getBase64Image = (imgUrl: string) => {
    return new Promise(function (resolve, reject) {
        const img = new Image();
        img.src = imgUrl;
        img.setAttribute("crossOrigin", "anonymous");

        img.onload = function () {
            const canvas = document.createElement("canvas");

            canvas.width = img.width;
            canvas.height = img.height;

            const ctx = canvas.getContext("2d");
            ctx?.drawImage(img, 0, 0);

            const dataURL = canvas.toDataURL("image/png");
            resolve(dataURL);
        };

        img.onerror = function () {
            reject("The image could not be loaded.");
        };
    });
};

function waitUntilImageLoaded(img: HTMLImageElement, src: string) {
    return new Promise((resolve) => {
        function onFinish() {
            img.onload = null;
            img.onerror = null;
            resolve(true);
        }
        img.onload = onFinish;
        img.onerror = onFinish;
        img.src = src;
        img.loading = "eager";
    });
}

export async function getQRAsCanvas(
    props: QRProps,
    type: string,
    getCanvas?: boolean
): Promise<HTMLCanvasElement | string> {
    // First get the SVG using the same logic as displayed
    const svgDataUri = await getQRAsSVGDataUri(props);
    const svgString = decodeURIComponent(
        svgDataUri.replace("data:image/svg+xml,", "")
    );

    return new Promise((resolve, reject) => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const img = new Image();

        // Set canvas size to match the QR code
        canvas.width = props.size || DEFAULT_SIZE;
        canvas.height = props.size || DEFAULT_SIZE;

        img.onload = () => {
            URL.revokeObjectURL(url);
            if (ctx) {
                // Fill white background for JPG
                if (type === "image/jpeg") {
                    ctx.fillStyle = "white";
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                }

                ctx.drawImage(img, 0, 0);

                if (getCanvas) {
                    resolve(canvas);
                } else {
                    const dataUrl = canvas.toDataURL(type, 1.0);
                    canvas.remove();
                    resolve(dataUrl);
                }
            } else {
                reject(new Error("Could not get canvas context"));
            }
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Could not load SVG"));
        };

        const svgBlob = new Blob([svgString], {
            type: "image/svg+xml;charset=utf-8",
        });
        const url = URL.createObjectURL(svgBlob);
        img.src = url;
    });
}

export function getQRData({
    url,
    fgColor,
    bgColor,
    eyeColor,
    dotColor,
    hideLogo,
    logo,
    margin,
}: {
    url: string;
    fgColor?: string;
    bgColor?: string;
    eyeColor?: string;
    dotColor?: string;
    hideLogo?: boolean;
    logo?: string;
    margin?: number;
}) {
    return {
        value: `${url}?qr=1`,
        bgColor,
        fgColor,
        eyeColor,
        dotColor,
        size: 1024,
        level: "Q", // QR Code error correction level: https://blog.qrstuff.com/general/qr-code-error-correction
        hideLogo,
        margin,
        ...(!hideLogo && {
            imageSettings: {
                src: logo || "/flogo-qr.svg",
                height: 256,
                width: 256,
                excavate: true,
            },
        }),
    };
}
