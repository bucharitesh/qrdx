/** biome-ignore-all lint/performance/noBarrelFile: false positive */
/** biome-ignore-all lint/style/noMagicNumbers: false positive */
/** biome-ignore-all lint/correctness/useImageSize: false positive */
/** biome-ignore-all lint/a11y/noNoninteractiveElementInteractions: false positive */
/** biome-ignore-all lint/performance/noImgElement: false positive */
/** biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: false positive */

/**
 * @license qrcode.react
 * Copyright (c) Paul O'Shannessy
 * SPDX-License-Identifier: ISC
 */
import { type JSX, useEffect, useRef, useState } from "react";
import type { QRProps, QRPropsCanvas } from "../types";
import { normalizeColorConfig } from "../types/color";
import qrcodegen from "./codegen";
import {
  DEFAULT_BGCOLOR,
  DEFAULT_FGCOLOR,
  DEFAULT_LEVEL,
  DEFAULT_MARGIN,
  DEFAULT_SIZE,
  ERROR_LEVEL_MAP,
} from "./constants";
import {
  excavateModules,
  generatePath,
  getImageSettings,
  SUPPORTS_PATH2D,
} from "./utils";

export * from "../types";
export * from "./api";
export * from "./detection";
export * from "./download";
export * from "./qr-code";
export * from "./templates";
export * from "./utils";

export function QRCodeCanvas(props: QRPropsCanvas) {
  const {
    value,
    size = DEFAULT_SIZE,
    level = DEFAULT_LEVEL,
    bgColor = DEFAULT_BGCOLOR,
    fgColor = DEFAULT_FGCOLOR,
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
  const [_isImgLoaded, setIsImageLoaded] = useState(false);

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

      if (haveImageToRender && calculatedImageSettings.excavation != null) {
        cells = excavateModules(cells, calculatedImageSettings.excavation);
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
      // Extract solid color from bgColor (canvas doesn't support gradient objects)
      const bgColorNormalized = normalizeColorConfig(bgColor, DEFAULT_BGCOLOR);
      ctx.fillStyle =
        bgColorNormalized.type === "solid"
          ? bgColorNormalized.color
          : bgColorNormalized.stops[0]?.color || DEFAULT_BGCOLOR;
      ctx.fillRect(0, 0, numCells, numCells);

      // Extract solid color from fgColor (canvas doesn't support gradient objects)
      const fgColorNormalized = normalizeColorConfig(fgColor, DEFAULT_FGCOLOR);
      ctx.fillStyle =
        fgColorNormalized.type === "solid"
          ? fgColorNormalized.color
          : fgColorNormalized.stops[0]?.color || DEFAULT_FGCOLOR;
      if (SUPPORTS_PATH2D) {
        // $FlowFixMe: Path2D c'tor doesn't support args yet.
        ctx.fill(new Path2D(generatePath(cells, margin)));
      } else {
        cells.forEach((row, rdx) => {
          row.forEach((cell, cdx) => {
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

  const canvasStyle = { height: size, width: size, ...style };
  let img: JSX.Element | null = null;
  if (imgSrc != null) {
    img = (
      <img
        alt="QR code"
        key={imgSrc}
        onLoad={() => {
          setIsImageLoaded(true);
        }}
        ref={_image}
        src={imgSrc}
        style={{ display: "none" }}
      />
    );
  }
  return (
    <>
      <canvas
        height={size}
        ref={_canvas}
        style={canvasStyle}
        width={size}
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
      // Remove the image from settings if it fails to load
      // This prevents SVG from containing external URLs that will fail during canvas conversion
      const { imageSettings: _removed, ...propsWithoutImage } = props;
      updatedProps = propsWithoutImage;
    }
  }

  // Create the SVG element with all props including templateId
  // Filter out props that aren't valid for QRCodeSVG (like hideLogo, url, etc.)
  const {
    hideLogo: _hideLogo,
    url: _url,
    logo: _logo,
    scale: _scale,
    ...validSVGProps
  } = updatedProps as any;

  const svgElement = React.createElement(QRCodeSVG, {
    ...validSVGProps,
    templateId: updatedProps.templateId, // Ensure templateId is passed
    customTemplate: updatedProps.customTemplate, // Ensure customTemplate is passed
  });

  const svgString = renderToStaticMarkup(svgElement);

  return `data:image/svg+xml,${encodeURIComponent(svgString)}`;
}

const getBase64Image = (imgUrl: string) =>
  new Promise((resolve, reject) => {
    // If already a data URL, return as is
    if (imgUrl.startsWith("data:")) {
      resolve(imgUrl);
      return;
    }

    const img = new Image();
    // Set crossOrigin before setting src
    img.crossOrigin = "anonymous";

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not get canvas context"));
          return;
        }

        ctx.drawImage(img, 0, 0);
        const dataURL = canvas.toDataURL("image/png");

        canvas.remove();
        resolve(dataURL);
      } catch (error) {
        reject(new Error(`Failed to convert image to base64: ${error}`));
      }
    };

    img.onerror = () => {
      reject(
        new Error(
          `Could not load image from ${imgUrl.substring(0, 100)}... Check CORS settings or use a data URL.`
        )
      );
    };

    img.src = imgUrl;
  });

// function waitUntilImageLoaded(img: HTMLImageElement, src: string) {
//   return new Promise((resolve) => {
//     function onFinish() {
//       img.onload = null;
//       img.onerror = null;
//       resolve(true);
//     }
//     img.onload = onFinish;
//     img.onerror = onFinish;
//     img.src = src;
//     img.loading = "eager";
//   });
// }

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

  // Convert SVG to base64 for better compatibility
  let base64DataUri: string;
  try {
    // Use modern approach instead of deprecated unescape
    const utf8Bytes = new TextEncoder().encode(svgString);
    const binaryString = Array.from(utf8Bytes, (byte) =>
      String.fromCharCode(byte)
    ).join("");
    const base64SVG = btoa(binaryString);
    base64DataUri = `data:image/svg+xml;base64,${base64SVG}`;
  } catch (error) {
    throw new Error(`Failed to encode SVG for canvas conversion: ${error}`);
  }

  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      reject(new Error("Could not get canvas context"));
      return;
    }

    const img = new Image();

    // Set canvas size to match the QR code
    const size = props.size || DEFAULT_SIZE;
    canvas.width = size;
    canvas.height = size;

    // Add timeout to prevent hanging
    const timeout = setTimeout(() => {
      canvas.remove();
      reject(
        new Error(
          "SVG load timeout - image may be too large or contain invalid data"
        )
      );
    }, 30_000); // 30 second timeout

    img.onload = () => {
      clearTimeout(timeout);
      try {
        // Fill white background for JPG
        if (type === "image/jpeg") {
          ctx.fillStyle = "white";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        ctx.drawImage(img, 0, 0, size, size);

        if (getCanvas) {
          resolve(canvas);
        } else {
          const dataUrl = canvas.toDataURL(type, 1.0);
          canvas.remove();
          resolve(dataUrl);
        }
      } catch (error) {
        clearTimeout(timeout);
        canvas.remove();
        reject(new Error(`Failed to draw SVG to canvas: ${error}`));
      }
    };

    img.onerror = () => {
      clearTimeout(timeout);
      canvas.remove();
      reject(new Error("Could not load SVG"));
    };

    // Use base64-encoded data URI for maximum compatibility
    img.src = base64DataUri;
  });
}

export { getQRData } from "./helpers";
