/** biome-ignore-all lint/performance/noBarrelFile: false positive */
/** biome-ignore-all lint/style/noMagicNumbers: false positive */

import type { QRProps } from "../types";
import { DEFAULT_SIZE } from "./constants";
import { getFrameDimensions } from "./frame";

export * from "../types";
export * from "./api";
export * from "./detection";
export * from "./download";
export {
  FRAME_FONT_FAMILY,
  FRAME_GAP_RATIO,
  type FrameBox,
  type FrameLabel,
  type FrameLayout,
  type FramePolygon,
  type FrameRect,
  type FrameShape,
  getFrameDimensions,
  getFrameLayout,
  getFrameText,
  isFrameActive,
} from "./frame";
export * from "./print";
export * from "./qr-code";
// QRCodeCanvas is the only export that needs client-only hooks. It lives in
// its own "use client" module (built as a separate entry) so the rest of the
// package stays usable from React Server Components.
export { QRCodeCanvas } from "./qr-code-canvas";
export * from "./scan-score";
export * from "./templates";
export * from "./utils";

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
    } catch (_error) {
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
          `Could not load image from ${imgUrl.slice(0, 100)}... Check CORS settings or use a data URL.`
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

    // Set canvas size to match the QR code (plus its frame, if any)
    const { width, height } = getFrameDimensions(
      props.size || DEFAULT_SIZE,
      props.frame
    );
    canvas.width = Math.round(width);
    canvas.height = Math.round(height);

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

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

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
