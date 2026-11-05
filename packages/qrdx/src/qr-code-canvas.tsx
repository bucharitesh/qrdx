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
import { logoImageBox, traceLogoShape } from "./logo";
import { capImageSettings } from "./logo-budget";
import { getLayoutMargin, shapeBackground, shapeDecoration } from "./qr-shape";
import {
  excavateModules,
  generatePath,
  getImageSettings,
  resolveErrorLevel,
  SUPPORTS_PATH2D,
} from "./utils";
import { getSolidColor } from "./utils/color";

export function QRCodeCanvas(props: QRPropsCanvas) {
  const {
    value,
    size = DEFAULT_SIZE,
    level = DEFAULT_LEVEL,
    bgColor = DEFAULT_BGCOLOR,
    fgColor = DEFAULT_FGCOLOR,
    margin = DEFAULT_MARGIN,
    style,
    imageSettings: requestedImageSettings,
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
    eyeColors: _eyeColors,
    moduleScale: _moduleScale,
    frameLabelMarkers: _frameLabelMarkers,
    autoLevel,
    shape,
    ...otherProps
  } = props;
  // A logo no bigger than the code can repair (logo-budget.ts)
  const imageSettings = capImageSettings(
    { value, size, margin, level, shape, autoLevel },
    requestedImageSettings
  );
  const effectiveLevel = resolveErrorLevel({
    value,
    size,
    level,
    margin,
    imageSettings,
    autoLevel,
    shape,
  });
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
        ERROR_LEVEL_MAP[effectiveLevel]
      ).getModules();

      // A shaped code (circle, heart, silhouette) sits further in, inside
      // its outline, with decorative modules around its quiet ring
      const layoutMargin = getLayoutMargin(cells.length, margin, shape);
      const decoration = shapeDecoration(value, cells.length, margin, shape);
      const numCells = cells.length + layoutMargin * 2;
      const calculatedImageSettings = getImageSettings(
        cells,
        size,
        layoutMargin,
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

      // Draw solid background, only paint dark modules. This canvas draws
      // solid colors only: a gradient uses its first stop, an image fill its
      // underlay (QRCodeSVG and the exports draw them in full).
      ctx.fillStyle = getSolidColor(bgColor, DEFAULT_BGCOLOR);
      const background = shapeBackground(shape, numCells);
      if (background && "circle" in background) {
        ctx.beginPath();
        ctx.arc(numCells / 2, numCells / 2, background.circle, 0, 2 * Math.PI);
        ctx.fill();
      } else if (background && SUPPORTS_PATH2D) {
        ctx.fill(new Path2D(background.path), "evenodd");
      } else {
        ctx.fillRect(0, 0, numCells, numCells);
      }

      ctx.fillStyle = getSolidColor(fgColor, DEFAULT_FGCOLOR);
      if (SUPPORTS_PATH2D) {
        // $FlowFixMe: Path2D c'tor doesn't support args yet.
        ctx.fill(new Path2D(generatePath(cells, layoutMargin)));
        if (decoration) {
          ctx.fill(new Path2D(generatePath(decoration, 0)));
        }
      } else {
        for (const [grid, offset] of [
          [cells, layoutMargin],
          [decoration ?? [], 0],
        ] as const) {
          grid.forEach((row, rdx) => {
            row.forEach((cell, cdx) => {
              if (cell) {
                ctx.fillRect(cdx + offset, rdx + offset, 1, 1);
              }
            });
          });
        }
      }

      if (haveImageToRender) {
        const box = {
          x: calculatedImageSettings.x + layoutMargin,
          y: calculatedImageSettings.y + layoutMargin,
          w: calculatedImageSettings.w,
          h: calculatedImageSettings.h,
        };
        const shape = imageSettings?.shape ?? "square";
        const plate = imageSettings?.plate;
        const imageBox = logoImageBox(box, plate);
        ctx.save();
        if (plate) {
          traceLogoShape(ctx, shape, box);
          ctx.fillStyle = plate;
          ctx.fill();
        }
        if (shape !== "square") {
          traceLogoShape(ctx, shape, imageBox);
          ctx.clip();
        }
        ctx.drawImage(image, imageBox.x, imageBox.y, imageBox.w, imageBox.h);
        ctx.restore();
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
