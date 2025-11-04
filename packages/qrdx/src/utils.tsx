import type { JSX } from "react";
import React from "react";
import type { Excavation, ImageSettings, Modules, QRPropsSVG } from "../types";
import qrcodegen from "./codegen";
import {
  DEFAULT_BGCOLOR,
  DEFAULT_FGCOLOR,
  DEFAULT_IMG_SCALE,
  DEFAULT_LEVEL,
  DEFAULT_MARGIN,
  DEFAULT_SIZE,
  ERROR_LEVEL_MAP,
} from "./constants";
import { generateCornerDotPath } from "./corner-dot";
import { generateCornerSquarePath } from "./corner-eye";
import { getTemplate } from "./templates";

// We could just do this in generatePath, except that we want to support
// non-Path2D canvas, so we need to keep it an explicit step.
export function excavateModules(
  modules: Modules,
  excavation: Excavation
): Modules {
  return modules.slice().map((row, y) => {
    if (y < excavation.y || y >= excavation.y + excavation.h) {
      return row;
    }
    return row.map((cell, x) => {
      if (x < excavation.x || x >= excavation.x + excavation.w) {
        return cell;
      }
      return false;
    });
  });
}

export function generatePath(modules: Modules, margin = 0): string {
  const ops: string[] = [];
  modules.forEach((row, y) => {
    let start: number | null = null;
    row.forEach((cell, x) => {
      if (!cell && start !== null) {
        // M0 0h7v1H0z injects the space with the move and drops the comma,
        // saving a char per operation
        ops.push(
          `M${start + margin} ${y + margin}h${x - start}v1H${start + margin}z`
        );
        start = null;
        return;
      }

      // end of row, clean up or skip
      if (x === row.length - 1) {
        if (!cell) {
          // We would have closed the op above already so this can only mean
          // 2+ light modules in a row.
          return;
        }
        if (start === null) {
          // Just a single dark module.
          ops.push(`M${x + margin},${y + margin} h1v1H${x + margin}z`);
        } else {
          // Otherwise finish the current line.
          ops.push(
            `M${start + margin},${y + margin} h${x + 1 - start}v1H${
              start + margin
            }z`
          );
        }
        return;
      }

      if (cell && start === null) {
        start = x;
      }
    });
  });
  return ops.join("");
}

// Helper function to check if a module is part of a position detection pattern (corner)
function isCornerModule(x: number, y: number, size: number): boolean {
  // Top-left corner (0,0 to 6,6)
  if (x < 7 && y < 7) {
    return true;
  }
  // Top-right corner (size-7,0 to size-1,6)
  if (x >= size - 7 && y < 7) {
    return true;
  }
  // Bottom-left corner (0,size-7 to 6,size-1)
  if (x < 7 && y >= size - 7) {
    return true;
  }
  return false;
}

// Generate circles for data modules with different patterns
function generateDataCircles(
  modules: Modules,
  options: {
    margin: number;
    pixelSize: number;
    pattern?:
      | "circle"
      | "square"
      | "diamond"
      | "circle-mixed"
      | "pacman"
      | "rounded"
      | "clean-square";
  }
): JSX.Element[] {
  const { margin, pixelSize, pattern = "circle" } = options;
  const shapes: JSX.Element[] = [];
  const qrSize = modules.length;
  const radius = pixelSize * 0.333_333; // radius for circles

  modules.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (cell && !isCornerModule(x, y, qrSize)) {
        const cx = (x + 0.5 + margin) * pixelSize;
        const cy = (y + 0.5 + margin) * pixelSize;
        const key = `${x}-${y}`;

        switch (pattern) {
          case "circle":
            // Pattern 1: Standard circles
            shapes.push(
              <circle
                cx={cx}
                cy={cy}
                key={key}
                r={radius}
                transform={`rotate(0,${cx},${cy})`}
              />
            );
            break;

          case "square":
            // Pattern 2: Squares
            {
              const halfSize = pixelSize * 0.357_143; // half of 71.4% pixel size
              shapes.push(
                <path
                  d={`M ${cx - halfSize} ${cy - halfSize}v ${pixelSize * 0.714_286}h ${pixelSize * 0.714_286}v -${pixelSize * 0.714_286}z`}
                  key={key}
                  transform={`rotate(0,${cx},${cy})`}
                />
              );
            }
            break;

          case "diamond":
            // Pattern 3: Squares rotated 45 degrees (diamond shape)
            {
              const halfSize = pixelSize * 0.357_143;
              shapes.push(
                <path
                  d={`M ${cx - halfSize} ${cy - halfSize}v ${pixelSize * 0.714_286}h ${pixelSize * 0.714_286}v -${pixelSize * 0.714_286}z`}
                  key={key}
                  transform={`rotate(45,${cx},${cy})`}
                />
              );
            }
            break;

          case "circle-mixed":
            // Pattern 4: Circles with varying sizes
            {
              const randomFactor =
                (x + y) % 3 === 0 ? 1.5 : (x + y) % 2 === 0 ? 1.0 : 1.25;
              const variedRadius = radius * randomFactor;
              shapes.push(
                <circle
                  cx={cx}
                  cy={cy}
                  key={key}
                  r={variedRadius}
                  transform={`rotate(0,${cx},${cy})`}
                />
              );
            }
            break;

          case "pacman":
            // Pattern 5: Rounded rectangles (pill shapes)
            {
              const halfWidth = pixelSize * 0.5;
              const halfHeight = pixelSize * 0.357_143;
              shapes.push(
                <path
                  d={`M ${cx - halfWidth} ${cy - halfHeight}v ${pixelSize * 0.714_286}h ${halfWidth}a ${halfWidth * 0.5} ${halfWidth * 0.5}, 0, 0, 0, 0 -${pixelSize * 0.714_286}h -${halfWidth}v -${pixelSize * 0.714_286}z`}
                  key={key}
                  transform={`rotate(${((x + y) % 2) === 0 ? 0 : 90},${cx},${cy})`}
                />
              );
            }
            break;

          case "rounded":
            // Pattern: Clean squares with rounded corners
            {
              const halfSize = pixelSize * 0.5;
              const cornerRadius = pixelSize * 0.2; // 20% radius for smooth corners
              shapes.push(
                <rect
                  height={pixelSize}
                  key={key}
                  rx={cornerRadius}
                  ry={cornerRadius}
                  transform={`rotate(0,${cx},${cy})`}
                  width={pixelSize}
                  x={cx - halfSize}
                  y={cy - halfSize}
                />
              );
            }
            break;

          case "clean-square":
            // Pattern 12: Clean rectangles only
            {
              const halfSize = pixelSize * 0.5;
              shapes.push(
                <rect
                  height={pixelSize}
                  key={key}
                  transform={`rotate(0,${cx},${cy})`}
                  width={pixelSize}
                  x={cx - halfSize}
                  y={cy - halfSize}
                />
              );
            }
            break;

          default:
            // Default to circle
            shapes.push(
              <circle
                cx={cx}
                cy={cy}
                key={key}
                r={radius}
                transform={`rotate(0,${cx},${cy})`}
              />
            );
        }
      }
    });
  });

  return shapes;
}

export function getImageSettings(
  cells: Modules,
  size: number,
  _margin: number,
  imageSettings?: ImageSettings
): null | {
  x: number;
  y: number;
  h: number;
  w: number;
  excavation: Excavation | null;
} {
  if (imageSettings == null) {
    return null;
  }

  const qrCodeSize = cells.length;
  const defaultSize = Math.floor(size * DEFAULT_IMG_SCALE);
  const scale = qrCodeSize / size;
  const w = (imageSettings.width || defaultSize) * scale;
  const h = (imageSettings.height || defaultSize) * scale;

  // Center the image in the QR code area (without margins)
  const x =
    imageSettings.x == null ? qrCodeSize / 2 - w / 2 : imageSettings.x * scale;
  const y =
    imageSettings.y == null ? qrCodeSize / 2 - h / 2 : imageSettings.y * scale;

  let excavation: Excavation | null = null;
  if (imageSettings.excavate) {
    const floorX = Math.floor(x);
    const floorY = Math.floor(y);
    const ceilW = Math.ceil(w + x - floorX);
    const ceilH = Math.ceil(h + y - floorY);
    excavation = { x: floorX, y: floorY, w: ceilW, h: ceilH };
  }

  return { x, y, h, w, excavation };
}

export function convertImageSettingsToPixels(
  calculatedImageSettings: {
    x: number;
    y: number;
    w: number;
    h: number;
    excavation: Excavation | null;
  },
  size: number,
  numCells: number,
  margin: number
) {
  const pixelRatio = size / numCells;
  const imgWidth = calculatedImageSettings.w * pixelRatio;
  const imgHeight = calculatedImageSettings.h * pixelRatio;
  const imgLeft = (calculatedImageSettings.x + margin) * pixelRatio;
  const imgTop = (calculatedImageSettings.y + margin) * pixelRatio;

  return { imgWidth, imgHeight, imgLeft, imgTop };
}

export function QRCodeSVG(props: QRPropsSVG) {
  const {
    value,
    size = DEFAULT_SIZE,
    level = DEFAULT_LEVEL,
    bgColor = DEFAULT_BGCOLOR,
    fgColor = DEFAULT_FGCOLOR,
    eyeColor,
    dotColor,
    bodyPattern = "circle",
    cornerEyePattern = "gear",
    cornerEyeDotPattern = "circle",
    margin = DEFAULT_MARGIN,
    isOGContext = false,
    imageSettings,
    templateId,
    customText,
    ...otherProps
  } = props;

  const shouldUseHigherErrorLevel =
    isOGContext && imageSettings?.excavate && (level === "L" || level === "M");

  // Use a higher error correction level 'Q' when excavation is enabled
  // to ensure the QR code remains scannable despite the removed modules.
  const effectiveLevel = shouldUseHigherErrorLevel ? "Q" : level;

  let cells = qrcodegen.QrCode.encodeText(
    value,
    ERROR_LEVEL_MAP[effectiveLevel]
  ).getModules();

  const numCells = cells.length + margin * 2;
  const calculatedImageSettings = getImageSettings(
    cells,
    size,
    margin,
    imageSettings
  );

  let image: null | JSX.Element = null;
  if (imageSettings != null && calculatedImageSettings != null) {
    if (calculatedImageSettings.excavation != null) {
      cells = excavateModules(cells, calculatedImageSettings.excavation);
    }

    // Convert image settings from module coordinates to pixel coordinates
    const { imgWidth, imgHeight, imgLeft, imgTop } =
      convertImageSettingsToPixels(
        calculatedImageSettings,
        size,
        numCells,
        margin
      );

    if (isOGContext) {
      image = (
        <img
          alt="Logo"
          src={imageSettings.src}
          style={{
            position: "absolute",
            left: `${imgLeft}px`,
            top: `${imgTop}px`,
            width: `${imgWidth}px`,
            height: `${imgHeight}px`,
          }}
        />
      );
    } else {
      image = (
        <image
          height={imgHeight}
          href={imageSettings.src}
          preserveAspectRatio="none"
          width={imgWidth}
          x={imgLeft}
          y={imgTop}
        />
      );
    }
  }

  // Calculate pixel size for positioning
  const pixelSize = size / numCells;
  const qrSize = cells.length;
  const cornerSize = 7 * pixelSize; // Corner patterns are 7x7 modules
  const cornerDotRadius = 1.5 * pixelSize; // Inner dot radius

  // Generate data circles with selected pattern
  const dataCircles = generateDataCircles(cells, {
    margin,
    pixelSize,
    pattern: bodyPattern,
  });

  // Calculate corner positions with margin
  const topLeftX = margin * pixelSize;
  const topLeftY = margin * pixelSize;
  const topRightX = (qrSize - 7 + margin) * pixelSize;
  const topRightY = margin * pixelSize;
  const bottomLeftX = margin * pixelSize;
  const bottomLeftY = (qrSize - 7 + margin) * pixelSize;

  // QR Code content (can be used standalone or inside wrapper)
  const qrContent = (
    <>
      <style>{`
        .background-color { fill: ${bgColor}; }
        .dot-color { fill: ${fgColor}; }
        .corners-square-color-0-0 { fill: ${eyeColor || fgColor}; }
        .corners-dot-color-0-0 { fill: ${dotColor || fgColor}; }
        .corners-square-color-1-0 { fill: ${eyeColor || fgColor}; }
        .corners-dot-color-1-0 { fill: ${dotColor || fgColor}; }
        .corners-square-color-0-1 { fill: ${eyeColor || fgColor}; }
        .corners-dot-color-0-1 { fill: ${dotColor || fgColor}; }
      `}</style>

      {/* Background */}
      <rect
        className="background-color"
        height={size}
        width={size}
        x={0}
        y={0}
      />

      {/* Data module circles */}
      <g className="dot-color">{dataCircles}</g>

      {/* Top-left corner square */}
      <g className="corners-square-color-0-0">
        <path
          clipRule="evenodd"
          d={generateCornerSquarePath(
            topLeftX,
            topLeftY,
            cornerSize,
            cornerEyePattern
          )}
          transform={`rotate(0,${topLeftX + cornerSize / 2},${topLeftY + cornerSize / 2})`}
        />
      </g>

      {/* Top-left corner dot */}
      <g className="corners-dot-color-0-0">
        {generateCornerDotPath(
          topLeftX + cornerSize / 2,
          topLeftY + cornerSize / 2,
          cornerDotRadius,
          cornerEyeDotPattern
        )}
      </g>

      {/* Top-right corner square */}
      <g className="corners-square-color-1-0">
        <path
          clipRule="evenodd"
          d={generateCornerSquarePath(
            topRightX,
            topRightY,
            cornerSize,
            cornerEyePattern
          )}
          transform={`rotate(0,${topRightX + cornerSize / 2},${topRightY + cornerSize / 2})`}
        />
      </g>

      {/* Top-right corner dot */}
      <g className="corners-dot-color-1-0">
        {generateCornerDotPath(
          topRightX + cornerSize / 2,
          topRightY + cornerSize / 2,
          cornerDotRadius,
          cornerEyeDotPattern
        )}
      </g>

      {/* Bottom-left corner square */}
      <g className="corners-square-color-0-1">
        <path
          clipRule="evenodd"
          d={generateCornerSquarePath(
            bottomLeftX,
            bottomLeftY,
            cornerSize,
            cornerEyePattern
          )}
          transform={`rotate(0,${bottomLeftX + cornerSize / 2},${bottomLeftY + cornerSize / 2})`}
        />
      </g>

      {/* Bottom-left corner dot */}
      <g className="corners-dot-color-0-1">
        {generateCornerDotPath(
          bottomLeftX + cornerSize / 2,
          bottomLeftY + cornerSize / 2,
          cornerDotRadius,
          cornerEyeDotPattern
        )}
      </g>

      {image}
    </>
  );

  // Check if template is specified
  if (templateId) {
    const template = getTemplate(templateId);
    if (template) {
      // For templates, we need to create a properly sized SVG that fits the template coordinate system
      // Templates expect the QR content to be in a coordinate system that matches their transforms
      const templateSize = 300; // All templates use 300x300 base coordinate system

      // Create QR content as a complete SVG for templates
      const templateQrContent = (
        <svg
          height={templateSize}
          viewBox={`0 0 ${templateSize} ${templateSize}`}
          width={templateSize}
        >
          <style>{`
            .dot-color { fill: ${fgColor}; }
            .corners-square-color-0-0 { fill: ${eyeColor}; }
            .corners-dot-color-0-0 { fill: ${dotColor}; }
            .corners-square-color-1-0 { fill: ${eyeColor}; }
            .corners-dot-color-1-0 { fill: ${dotColor}; }
            .corners-square-color-0-1 { fill: ${eyeColor}; }
            .corners-dot-color-0-1 { fill: ${dotColor}; }
          `}</style>

          {/* Scale all QR elements to fit template coordinate system */}
          <g transform={`scale(${templateSize / size})`}>
            {/* Data module circles */}
            <g className="dot-color">{dataCircles}</g>

            {/* Top-left corner square */}
            <g className="corners-square-color-0-0">
              <path
                clipRule="evenodd"
                d={generateCornerSquarePath(
                  topLeftX,
                  topLeftY,
                  cornerSize,
                  cornerEyePattern
                )}
                transform={`rotate(0,${topLeftX + cornerSize / 2},${topLeftY + cornerSize / 2})`}
              />
            </g>

            {/* Top-left corner dot */}
            <g className="corners-dot-color-0-0">
              {generateCornerDotPath(
                topLeftX + cornerSize / 2,
                topLeftY + cornerSize / 2,
                cornerDotRadius,
                cornerEyeDotPattern
              )}
            </g>

            {/* Top-right corner square */}
            <g className="corners-square-color-1-0">
              <path
                clipRule="evenodd"
                d={generateCornerSquarePath(
                  topRightX,
                  topRightY,
                  cornerSize,
                  cornerEyePattern
                )}
                transform={`rotate(0,${topRightX + cornerSize / 2},${topRightY + cornerSize / 2})`}
              />
            </g>

            {/* Top-right corner dot */}
            <g className="corners-dot-color-1-0">
              {generateCornerDotPath(
                topRightX + cornerSize / 2,
                topRightY + cornerSize / 2,
                cornerDotRadius,
                cornerEyeDotPattern
              )}
            </g>

            {/* Bottom-left corner square */}
            <g className="corners-square-color-0-1">
              <path
                clipRule="evenodd"
                d={generateCornerSquarePath(
                  bottomLeftX,
                  bottomLeftY,
                  cornerSize,
                  cornerEyePattern
                )}
                transform={`rotate(0,${bottomLeftX + cornerSize / 2},${bottomLeftY + cornerSize / 2})`}
              />
            </g>

            {/* Bottom-left corner dot */}
            <g className="corners-dot-color-0-1">
              {generateCornerDotPath(
                bottomLeftX + cornerSize / 2,
                bottomLeftY + cornerSize / 2,
                cornerDotRadius,
                cornerEyeDotPattern
              )}
            </g>

            {image}
          </g>
        </svg>
      );

      // Use template wrapper with the QR content and pass the size
      const wrappedSvg = template.wrapper(templateQrContent, {
        fgColor,
        bgColor,
        customText,
        ...otherProps,
      });

      // Clone the wrapped SVG element and override width/height to match requested size
      // This ensures downloads get the proper size while keeping viewBox for scaling
      // Remove percentage-based styles that would interfere with absolute sizing
      // @ts-expect-error
      const originalStyle = wrappedSvg?.props?.style || {};
      const newStyle = {
        ...originalStyle,
        width: undefined,
        height: undefined,
      };

      // @ts-expect-error
      return React.cloneElement(wrappedSvg, {
        width: size,
        height: size,
        style: newStyle,
      });
    }
  }

  // Standard QR code without wrapper (backward compatibility)
  return (
    <svg
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      {...otherProps}
    >
      {qrContent}
    </svg>
  );
}

// For canvas we're going to switch our drawing mode based on whether or not
// the environment supports Path2D. We only need the constructor to be
// supported, but Edge doesn't actually support the path (string) type
// argument. Luckily it also doesn't support the addPath() method. We can
// treat that as the same thing.
export const SUPPORTS_PATH2D = (() => {
  try {
    new Path2D().addPath(new Path2D());
  } catch (_e) {
    return false;
  }
  return true;
})();

// Utility functions for contrast calculation
export const hexToRgb = (
  hex: string
): { r: number; g: number; b: number } | null => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: Number.parseInt(result[1], 16),
        g: Number.parseInt(result[2], 16),
        b: Number.parseInt(result[3], 16),
      }
    : null;
};

export const getLuminance = (r: number, g: number, b: number): number => {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    c /= 255;
    return c <= 0.039_28 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
};

export const getContrastRatio = (color1: string, color2: string): number => {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);

  if (!(rgb1 && rgb2)) {
    return 1;
  }

  const lum1 = getLuminance(rgb1.r, rgb1.g, rgb1.b);
  const lum2 = getLuminance(rgb2.r, rgb2.g, rgb2.b);

  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);

  return (brightest + 0.05) / (darkest + 0.05);
};

export const getContrastLevel = (
  ratio: number
): { level: string; warning: boolean; message: string } => {
  if (ratio >= 7) {
    return { level: "AAA", warning: false, message: "Excellent contrast" };
  }
  if (ratio >= 4.5) {
    return { level: "AA", warning: false, message: "Good contrast" };
  }
  if (ratio >= 3) {
    return {
      level: "AA Large",
      warning: true,
      message: "Low contrast - may be difficult to scan",
    };
  }
  return {
    level: "Fail",
    warning: true,
    message: "Poor contrast - QR code may not scan properly",
  };
};
