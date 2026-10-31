/** biome-ignore-all lint/style/noMagicNumbers: false positive */
/** biome-ignore-all lint/correctness/useImageSize: false positive */
/** biome-ignore-all lint/performance/noImgElement: false positive */
/** biome-ignore-all lint/a11y/noNoninteractiveElementInteractions: hidden loader image */

"use client";

/**
 * @license qrcode.react
 * Copyright (c) Paul O'Shannessy
 * SPDX-License-Identifier: ISC
 */
import { type JSX, useEffect, useRef, useState } from "react";
import type { QRPropsCanvas } from "../types";
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
import { drawFrameOnCanvas, getFrameLayout, isFrameActive } from "./frame";
import {
  excavateModules,
  generatePath,
  getImageSettings,
  SUPPORTS_PATH2D,
} from "./utils";

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
    // SVG-only styling props: the canvas renderer draws plain square modules,
    // so keep these off the <canvas> element.
    eyeColor: _eyeColor,
    dotColor: _dotColor,
    bodyPattern: _bodyPattern,
    cornerEyePattern: _cornerEyePattern,
    cornerEyeDotPattern: _cornerEyeDotPattern,
    isOGContext: _isOGContext,
    templateId: _templateId,
    customTemplate: _customTemplate,
    customProps: _customProps,
    frame,
    art: _art,
    ...otherProps
  } = props;
  const imgSrc = imageSettings?.src;
  const frameLayout = isFrameActive(frame)
    ? getFrameLayout(size, frame, bgColor)
    : null;
  const outputWidth = frameLayout?.width ?? size;
  const outputHeight = frameLayout?.height ?? size;
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
        image?.complete &&
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
      canvas.width = outputWidth * pixelRatio;
      canvas.height = outputHeight * pixelRatio;
      ctx.scale(pixelRatio, pixelRatio);
      if (frameLayout) {
        drawFrameOnCanvas(ctx, frameLayout);
        ctx.translate(frameLayout.qrX, frameLayout.qrY);
      }
      const scale = size / numCells;
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

  const canvasStyle = { height: outputHeight, width: outputWidth, ...style };
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
        height={outputHeight}
        ref={_canvas}
        style={canvasStyle}
        width={outputWidth}
        {...otherProps}
      />
      {img}
    </>
  );
}
