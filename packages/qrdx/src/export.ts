/** biome-ignore-all lint/style/noMagicNumbers: false positive */
// The export paths' first step: the code as an SVG data URI (with its logo
// embedded) and as a canvas. Download, clipboard, print PDF/EPS, the scan
// score and qrdx/node's PNG all start here; none of it needs React.

import type { QRProps } from "../types";
import { DEFAULT_SIZE } from "./constants";
import { getFrameDimensions } from "./frame";
import { toSVGString } from "./svg";
import { blobToDataUrl, canvasToWebP } from "./webp";

export async function getQRAsSVGDataUri(props: QRProps) {
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
    } catch {
      // Remove the image from settings if it fails to load
      // This prevents SVG from containing external URLs that will fail during canvas conversion
      const { imageSettings: _removed, ...propsWithoutImage } = props;
      updatedProps = propsWithoutImage;
    }
  }

  // Create the SVG element with all props including templateId
  // Filter out props that aren't valid for QRCodeSVG (like hideLogo, url, etc.)
  // Exports never carry the preview's frame label or part markers.
  const {
    hideLogo: _hideLogo,
    url: _url,
    logo: _logo,
    scale: _scale,
    frameLabelMarkers: _frameLabelMarkers,
    partMarkers: _partMarkers,
    ...validSVGProps
  } = updatedProps as any;

  // The same markup <QRCodeSVG> renders, drawn without React
  const svgString = toSVGString({
    ...validSVGProps,
    templateId: updatedProps.templateId, // Ensure templateId is passed
    customTemplate: updatedProps.customTemplate, // Ensure customTemplate is passed
  });

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
        } else if (type === "image/webp") {
          // toDataURL would hand back a PNG where the browser can't encode
          // WebP (Safari); canvasToWebP encodes it itself there.
          canvasToWebP(canvas)
            .then(blobToDataUrl)
            .then(resolve, reject)
            .finally(() => canvas.remove());
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
