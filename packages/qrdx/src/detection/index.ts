/**
 * QR Code Detection Module for qrdx
 * 
 * Provides comprehensive QR code detection capabilities including:
 * - Direct QR code image detection
 * - QR codes embedded in larger images
 * - Multiple QR codes detection
 * - Stylized QR codes (dots, custom patterns)
 * - Transparent QR codes
 */

import jsQR from "jsqr";
import type {
  DetectionProgress,
  FinderPattern,
  OpenCVStatus,
  OpenCVWorkerResponse,
  QRDetectionOptions,
  QRDetectionResult,
  QRLocation,
  QRPosition,
} from "../../types/detection";

// Default OpenCV CDN URL
const OPENCV_CDN_URL = "https://docs.opencv.org/4.9.0/opencv.js";

// Default detection options
const DEFAULT_OPTIONS: Required<Omit<QRDetectionOptions, "onProgress">> = {
  kernelSize: 9,
  useOpenCV: true,
  maxImageSize: 1500,
  detectMultiple: false,
  timeout: 30000,
  returnDetailedInfo: false,
};

// OpenCV worker instance
let opencvWorker: Worker | null = null;
let opencvStatus: OpenCVStatus = {
  ready: false,
  loading: false,
  progress: 0,
  status: "Not initialized",
};

// Worker message queue for async operations
const pendingMessages: Map<string, {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}> = new Map();

/**
 * Generate a unique message ID
 */
function generateMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Initialize the OpenCV worker
 */
export async function initOpenCVWorker(
  opencvUrl: string = OPENCV_CDN_URL
): Promise<OpenCVStatus> {
  if (opencvStatus.ready) {
    return opencvStatus;
  }

  if (opencvStatus.loading) {
    // Wait for loading to complete
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (opencvStatus.ready || !opencvStatus.loading) {
          clearInterval(checkInterval);
          resolve(opencvStatus);
        }
      }, 100);
    });
  }

  opencvStatus = { ...opencvStatus, loading: true, status: "Initializing worker..." };

  return new Promise((resolve) => {
    try {
      // Create worker from inline code
      const workerCode = `
        let cvReady = false;
        
        async function initOpenCV(opencvUrl) {
          if (cvReady) {
            self.postMessage({ type: 'init-success' });
            return;
          }
          
          self.postMessage({ type: 'init-progress', progress: 10, status: 'Downloading OpenCV.js...' });
          
          try {
            importScripts(opencvUrl);
            self.postMessage({ type: 'init-progress', progress: 60, status: 'Initializing WebAssembly...' });
            
            await new Promise((resolve, reject) => {
              const timeout = setTimeout(() => reject(new Error('OpenCV initialization timeout')), 30000);
              
              const checkInterval = setInterval(() => {
                if (typeof cv !== 'undefined' && cv.Mat) {
                  clearInterval(checkInterval);
                  clearTimeout(timeout);
                  resolve();
                }
              }, 100);
              
              if (typeof cv !== 'undefined' && cv.onRuntimeInitialized !== undefined) {
                const originalCallback = cv.onRuntimeInitialized;
                cv.onRuntimeInitialized = () => {
                  clearInterval(checkInterval);
                  clearTimeout(timeout);
                  if (originalCallback) originalCallback();
                  resolve();
                };
              }
            });
            
            cvReady = true;
            self.postMessage({ type: 'init-progress', progress: 100, status: 'Ready' });
            self.postMessage({ type: 'init-success' });
          } catch (error) {
            self.postMessage({ type: 'init-error', error: error.message || 'Failed to initialize OpenCV' });
          }
        }
        
        function applyMorphology(imageData, kernelSize, shape) {
          if (!cvReady) return null;
          
          try {
            const src = cv.matFromImageData(imageData);
            const gray = new cv.Mat();
            cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
            
            const inverted = new cv.Mat();
            cv.bitwise_not(gray, inverted);
            
            const kernel = cv.getStructuringElement(
              shape === 'ellipse' ? cv.MORPH_ELLIPSE : cv.MORPH_RECT,
              new cv.Size(kernelSize, kernelSize)
            );
            
            const closed = new cv.Mat();
            cv.morphologyEx(inverted, closed, cv.MORPH_CLOSE, kernel);
            
            const final = new cv.Mat();
            cv.bitwise_not(closed, final);
            
            const rgba = new cv.Mat();
            cv.cvtColor(final, rgba, cv.COLOR_GRAY2RGBA);
            
            const result = new ImageData(
              new Uint8ClampedArray(rgba.data),
              imageData.width,
              imageData.height
            );
            
            src.delete(); gray.delete(); inverted.delete();
            kernel.delete(); closed.delete(); final.delete(); rgba.delete();
            
            return result;
          } catch (e) {
            console.error('Morphology error:', e);
            return null;
          }
        }
        
        function applyAdaptiveThreshold(imageData, blockSize, c) {
          if (!cvReady) return null;
          
          try {
            const src = cv.matFromImageData(imageData);
            const gray = new cv.Mat();
            cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
            
            const thresholded = new cv.Mat();
            cv.adaptiveThreshold(gray, thresholded, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, blockSize, c);
            
            const rgba = new cv.Mat();
            cv.cvtColor(thresholded, rgba, cv.COLOR_GRAY2RGBA);
            
            const result = new ImageData(
              new Uint8ClampedArray(rgba.data),
              imageData.width,
              imageData.height
            );
            
            src.delete(); gray.delete(); thresholded.delete(); rgba.delete();
            return result;
          } catch (e) {
            console.error('Adaptive threshold error:', e);
            return null;
          }
        }
        
        function applyOtsuThreshold(imageData) {
          if (!cvReady) return null;
          
          try {
            const src = cv.matFromImageData(imageData);
            const gray = new cv.Mat();
            cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
            
            const blurred = new cv.Mat();
            cv.GaussianBlur(gray, blurred, new cv.Size(3, 3), 0);
            
            const thresholded = new cv.Mat();
            cv.threshold(blurred, thresholded, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);
            
            const rgba = new cv.Mat();
            cv.cvtColor(thresholded, rgba, cv.COLOR_GRAY2RGBA);
            
            const result = new ImageData(
              new Uint8ClampedArray(rgba.data),
              imageData.width,
              imageData.height
            );
            
            src.delete(); gray.delete(); blurred.delete(); thresholded.delete(); rgba.delete();
            return result;
          } catch (e) {
            console.error('Otsu threshold error:', e);
            return null;
          }
        }
        
        function sharpenImage(imageData) {
          if (!cvReady) return null;
          
          try {
            const src = cv.matFromImageData(imageData);
            const gray = new cv.Mat();
            cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
            
            const kernel = cv.Mat.zeros(3, 3, cv.CV_32F);
            const kernelData = new Float32Array(kernel.data.buffer);
            kernelData[0] = 0; kernelData[1] = -1; kernelData[2] = 0;
            kernelData[3] = -1; kernelData[4] = 5; kernelData[5] = -1;
            kernelData[6] = 0; kernelData[7] = -1; kernelData[8] = 0;
            
            const filtered = new cv.Mat();
            cv.filter2D(gray, filtered, cv.CV_8U, kernel, { x: -1, y: -1 }, 0, cv.BORDER_DEFAULT);
            
            const rgba = new cv.Mat();
            cv.cvtColor(filtered, rgba, cv.COLOR_GRAY2RGBA);
            
            const result = new ImageData(
              new Uint8ClampedArray(rgba.data),
              imageData.width,
              imageData.height
            );
            
            src.delete(); gray.delete(); kernel.delete(); filtered.delete(); rgba.delete();
            return result;
          } catch (e) {
            console.error('Sharpen error:', e);
            return null;
          }
        }
        
        function applyDotStyleMorphology(imageData, dilateSize, closeSize) {
          if (!cvReady) return null;
          
          try {
            const src = cv.matFromImageData(imageData);
            const gray = new cv.Mat();
            cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
            
            const inverted = new cv.Mat();
            cv.bitwise_not(gray, inverted);
            
            const dilateKernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(dilateSize, dilateSize));
            const dilated = new cv.Mat();
            cv.morphologyEx(inverted, dilated, cv.MORPH_DILATE, dilateKernel);
            
            const closeKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(closeSize, closeSize));
            const closed = new cv.Mat();
            cv.morphologyEx(dilated, closed, cv.MORPH_CLOSE, closeKernel);
            
            const final = new cv.Mat();
            cv.bitwise_not(closed, final);
            
            const rgba = new cv.Mat();
            cv.cvtColor(final, rgba, cv.COLOR_GRAY2RGBA);
            
            const result = new ImageData(
              new Uint8ClampedArray(rgba.data),
              imageData.width,
              imageData.height
            );
            
            src.delete(); gray.delete(); inverted.delete();
            dilateKernel.delete(); dilated.delete();
            closeKernel.delete(); closed.delete();
            final.delete(); rgba.delete();
            
            return result;
          } catch (e) {
            console.error('Dot-style morphology error:', e);
            return null;
          }
        }
        
        function applyOpenClose(imageData, openSize, closeSize) {
          if (!cvReady) return null;
          try {
            const src = cv.matFromImageData(imageData);
            const gray = new cv.Mat();
            cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
            const inverted = new cv.Mat();
            cv.bitwise_not(gray, inverted);
            const openKernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(openSize, openSize));
            const opened = new cv.Mat();
            cv.morphologyEx(inverted, opened, cv.MORPH_OPEN, openKernel);
            const closeKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(closeSize, closeSize));
            const closed = new cv.Mat();
            cv.morphologyEx(opened, closed, cv.MORPH_CLOSE, closeKernel);
            const final = new cv.Mat();
            cv.bitwise_not(closed, final);
            const rgba = new cv.Mat();
            cv.cvtColor(final, rgba, cv.COLOR_GRAY2RGBA);
            const result = new ImageData(new Uint8ClampedArray(rgba.data), imageData.width, imageData.height);
            src.delete(); gray.delete(); inverted.delete();
            openKernel.delete(); opened.delete(); closeKernel.delete(); closed.delete();
            final.delete(); rgba.delete();
            return result;
          } catch (e) {
            console.error('Open-close error:', e);
            return null;
          }
        }
        
        function applyUnsharpMask(imageData, strength, radius) {
          if (!cvReady) return null;
          try {
            const src = cv.matFromImageData(imageData);
            const gray = new cv.Mat();
            cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
            const ksize = Math.max(3, Math.floor(radius * 2) * 2 + 1);
            const blurred = new cv.Mat();
            cv.GaussianBlur(gray, blurred, new cv.Size(ksize, ksize), radius);
            const kernel = cv.Mat.zeros(3, 3, cv.CV_32F);
            const kd = new Float32Array(kernel.data.buffer);
            const center = 8 + strength;
            kd[0]=-strength;kd[1]=-strength;kd[2]=-strength;kd[3]=-strength;kd[4]=center;kd[5]=-strength;kd[6]=-strength;kd[7]=-strength;kd[8]=-strength;
            const sharpened = new cv.Mat();
            cv.filter2D(gray, sharpened, cv.CV_8U, kernel, { x: -1, y: -1 }, 0, cv.BORDER_DEFAULT);
            const rgba = new cv.Mat();
            cv.cvtColor(sharpened, rgba, cv.COLOR_GRAY2RGBA);
            const result = new ImageData(new Uint8ClampedArray(rgba.data), imageData.width, imageData.height);
            src.delete(); gray.delete(); blurred.delete(); kernel.delete(); sharpened.delete(); rgba.delete();
            return result;
          } catch (e) {
            return null;
          }
        }
        
        function applyHighPassSharpening(imageData, strength) {
          if (!cvReady) return null;
          try {
            const src = cv.matFromImageData(imageData);
            const gray = new cv.Mat();
            cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
            const kernel = cv.Mat.zeros(3, 3, cv.CV_32F);
            const kd = new Float32Array(kernel.data.buffer);
            const center = 8 + (strength || 1);
            const s = strength || 1;
            kd[0]=-s;kd[1]=-s;kd[2]=-s;kd[3]=-s;kd[4]=center;kd[5]=-s;kd[6]=-s;kd[7]=-s;kd[8]=-s;
            const sharpened = new cv.Mat();
            cv.filter2D(gray, sharpened, cv.CV_8U, kernel, { x: -1, y: -1 }, 0, cv.BORDER_DEFAULT);
            const rgba = new cv.Mat();
            cv.cvtColor(sharpened, rgba, cv.COLOR_GRAY2RGBA);
            const result = new ImageData(new Uint8ClampedArray(rgba.data), imageData.width, imageData.height);
            src.delete(); gray.delete(); kernel.delete(); sharpened.delete(); rgba.delete();
            return result;
          } catch (e) {
            return null;
          }
        }
        
        self.onmessage = async (event) => {
          const { type, id, ...data } = event.data;
          
          switch (type) {
            case 'init':
              await initOpenCV(data.opencvUrl);
              break;
            case 'morphology':
              const morphResult = applyMorphology(data.imageData, data.kernelSize, data.shape);
              self.postMessage({ type: 'morphology-result', id, imageData: morphResult });
              break;
            case 'adaptive-threshold':
              const atResult = applyAdaptiveThreshold(data.imageData, data.blockSize, data.c);
              self.postMessage({ type: 'adaptive-threshold-result', id, imageData: atResult });
              break;
            case 'otsu-threshold':
              const otsuResult = applyOtsuThreshold(data.imageData);
              self.postMessage({ type: 'otsu-threshold-result', id, imageData: otsuResult });
              break;
            case 'sharpen':
              const sharpResult = sharpenImage(data.imageData);
              self.postMessage({ type: 'sharpen-result', id, imageData: sharpResult });
              break;
            case 'dot-morphology':
              const dotResult = applyDotStyleMorphology(data.imageData, data.dilateSize, data.closeSize);
              self.postMessage({ type: 'dot-morphology-result', id, imageData: dotResult });
              break;
            case 'open-close-morphology':
              const ocResult = applyOpenClose(data.imageData, data.openSize, data.closeSize);
              self.postMessage({ type: 'open-close-result', id, imageData: ocResult });
              break;
            case 'unsharp':
              const unsharpResult = applyUnsharpMask(data.imageData, data.strength || 1.5, data.radius || 1);
              self.postMessage({ type: 'unsharp-result', id, imageData: unsharpResult });
              break;
            case 'highpass':
              const hpResult = applyHighPassSharpening(data.imageData, data.strength || 1);
              self.postMessage({ type: 'highpass-result', id, imageData: hpResult });
              break;
          }
        };
      `;

      const blob = new Blob([workerCode], { type: "application/javascript" });
      const workerUrl = URL.createObjectURL(blob);
      opencvWorker = new Worker(workerUrl);

      opencvWorker.onmessage = (event: MessageEvent<OpenCVWorkerResponse>) => {
        const response = event.data;

        switch (response.type) {
          case "init-success":
            opencvStatus = { ready: true, loading: false, progress: 100, status: "Ready" };
            resolve(opencvStatus);
            break;
          case "init-error":
            opencvStatus = { ready: false, loading: false, progress: 0, status: "Failed", error: response.error };
            resolve(opencvStatus);
            break;
          case "init-progress":
            opencvStatus = { ...opencvStatus, progress: response.progress, status: response.status };
            break;
          default:
            // Handle other message types (morphology results, etc.)
            const messageId = (event.data as { id?: string }).id;
            if (messageId && pendingMessages.has(messageId)) {
              const { resolve } = pendingMessages.get(messageId)!;
              pendingMessages.delete(messageId);
              resolve((event.data as { imageData?: ImageData }).imageData);
            }
        }
      };

      opencvWorker.onerror = (error) => {
        opencvStatus = { ready: false, loading: false, progress: 0, status: "Worker error", error: error.message };
        resolve(opencvStatus);
      };

      // Start initialization
      opencvWorker.postMessage({ type: "init", opencvUrl });
    } catch (error) {
      opencvStatus = {
        ready: false,
        loading: false,
        progress: 0,
        status: "Failed to create worker",
        error: error instanceof Error ? error.message : "Unknown error",
      };
      resolve(opencvStatus);
    }
  });
}

/**
 * Get the current OpenCV status
 */
export function getOpenCVStatus(): OpenCVStatus {
  return { ...opencvStatus };
}

/**
 * Send a message to the OpenCV worker and wait for response
 */
async function sendWorkerMessage(type: string, data: Record<string, unknown>): Promise<ImageData | null> {
  if (!opencvWorker || !opencvStatus.ready) {
    return null;
  }

  const id = generateMessageId();

  return new Promise((resolve) => {
    pendingMessages.set(id, {
      resolve: resolve as (value: unknown) => void,
      reject: () => resolve(null),
    });

    // Set timeout
    setTimeout(() => {
      if (pendingMessages.has(id)) {
        pendingMessages.delete(id);
        resolve(null);
      }
    }, 10000);

    opencvWorker!.postMessage({ type, id, ...data });
  });
}

// ============================================================================
// Image Processing Utilities
// ============================================================================

/**
 * Convert ImageData to data URL
 */
function imageDataToUrl(imageData: ImageData): string {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.putImageData(imageData, 0, 0);
  }
  return canvas.toDataURL("image/png");
}

/**
 * Flatten transparency - composite on white background
 */
function flattenTransparency(imageData: ImageData): ImageData {
  const data = new Uint8ClampedArray(imageData.data);
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3] / 255;
    if (alpha < 1) {
      data[i] = Math.round(data[i] * alpha + 255 * (1 - alpha));
      data[i + 1] = Math.round(data[i + 1] * alpha + 255 * (1 - alpha));
      data[i + 2] = Math.round(data[i + 2] * alpha + 255 * (1 - alpha));
      data[i + 3] = 255;
    }
  }
  return new ImageData(data, imageData.width, imageData.height);
}

/**
 * Add quiet zone (white border) around image
 */
function addQuietZone(imageData: ImageData, padding: number = 40): ImageData {
  const newWidth = imageData.width + padding * 2;
  const newHeight = imageData.height + padding * 2;
  const canvas = document.createElement("canvas");
  canvas.width = newWidth;
  canvas.height = newHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return imageData;

  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, newWidth, newHeight);

  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = imageData.width;
  tempCanvas.height = imageData.height;
  const tempCtx = tempCanvas.getContext("2d");
  if (tempCtx) {
    tempCtx.putImageData(imageData, 0, 0);
    ctx.drawImage(tempCanvas, padding, padding);
  }

  return ctx.getImageData(0, 0, newWidth, newHeight);
}

/**
 * Check if image has significant transparency
 */
function hasTransparency(imageData: ImageData): boolean {
  let transparentPixels = 0;
  const totalPixels = imageData.width * imageData.height;

  for (let i = 3; i < imageData.data.length; i += 4) {
    if (imageData.data[i] < 250) {
      transparentPixels++;
    }
  }

  return transparentPixels > totalPixels * 0.01;
}

/**
 * Invert image colors
 */
function invertImage(imageData: ImageData): ImageData {
  const data = new Uint8ClampedArray(imageData.data);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255 - data[i];
    data[i + 1] = 255 - data[i + 1];
    data[i + 2] = 255 - data[i + 2];
  }
  return new ImageData(data, imageData.width, imageData.height);
}

/**
 * Extract a region from an image element
 */
function extractRegion(
  source: HTMLImageElement | HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  h: number,
  targetW: number,
  targetH: number
): ImageData | null {
  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, x, y, w, h, 0, 0, targetW, targetH);
  return ctx.getImageData(0, 0, targetW, targetH);
}

/**
 * Load image from File
 */
function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };

    img.src = url;
  });
}

/**
 * Load image from URL
 */
function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image from ${url}`));

    img.src = url;
  });
}

/**
 * Get ImageData from various sources
 */
function getImageData(
  source: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
  maxSize?: number
): ImageData | null {
  let width: number;
  let height: number;

  if (source instanceof HTMLImageElement) {
    width = source.naturalWidth;
    height = source.naturalHeight;
  } else if (source instanceof HTMLCanvasElement) {
    width = source.width;
    height = source.height;
  } else if (source instanceof HTMLVideoElement) {
    width = source.videoWidth;
    height = source.videoHeight;
  } else {
    return null;
  }

  // Scale down if needed
  if (maxSize && (width > maxSize || height > maxSize)) {
    const scale = maxSize / Math.max(width, height);
    width = Math.floor(width * scale);
    height = Math.floor(height * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(source, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

// ============================================================================
// QR Code Detection
// ============================================================================

/**
 * Try to decode QR from ImageData using jsQR
 */
function tryDecode(
  imageData: ImageData,
  strategyName: string
): { data: string; location: QRLocation } | null {
  try {
    const qrCode = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "attemptBoth",
    });

    if (qrCode?.location && qrCode.data?.trim().length > 0) {
      // Validate - QR should not span the entire image (likely false positive)
      const loc = qrCode.location;
      const qrWidth = Math.abs(loc.topRightCorner.x - loc.topLeftCorner.x);
      const qrHeight = Math.abs(loc.bottomLeftCorner.y - loc.topLeftCorner.y);
      const widthRatio = qrWidth / imageData.width;
      const heightRatio = qrHeight / imageData.height;

      if (widthRatio > 0.95 && heightRatio > 0.95 && qrCode.data.length < 3) {
        return null;
      }

      return { data: qrCode.data, location: qrCode.location };
    }
  } catch (e) {
    console.error(`Decode error (${strategyName}):`, e);
  }
  return null;
}

/**
 * Calculate position from QR location
 */
function locationToPosition(location: QRLocation): QRPosition {
  const corners = [
    location.topLeftCorner,
    location.topRightCorner,
    location.bottomLeftCorner,
    location.bottomRightCorner,
  ];

  const minX = Math.min(...corners.map((c) => c.x));
  const maxX = Math.max(...corners.map((c) => c.x));
  const minY = Math.min(...corners.map((c) => c.y));
  const maxY = Math.max(...corners.map((c) => c.y));

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Crop QR code from the original image
 */
function cropQRCode(
  source: HTMLImageElement | HTMLCanvasElement,
  location: QRLocation,
  scaleX: number = 1,
  scaleY: number = 1,
  offsetX: number = 0,
  offsetY: number = 0
): string | null {
  try {
    const sourceWidth = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
    const sourceHeight = source instanceof HTMLImageElement ? source.naturalHeight : source.height;

    const corners = [
      { x: location.topLeftCorner.x * scaleX + offsetX, y: location.topLeftCorner.y * scaleY + offsetY },
      { x: location.topRightCorner.x * scaleX + offsetX, y: location.topRightCorner.y * scaleY + offsetY },
      { x: location.bottomLeftCorner.x * scaleX + offsetX, y: location.bottomLeftCorner.y * scaleY + offsetY },
      { x: location.bottomRightCorner.x * scaleX + offsetX, y: location.bottomRightCorner.y * scaleY + offsetY },
    ];

    const padding = 30;
    const minX = Math.max(0, Math.min(...corners.map((c) => c.x)) - padding);
    const maxX = Math.min(sourceWidth, Math.max(...corners.map((c) => c.x)) + padding);
    const minY = Math.max(0, Math.min(...corners.map((c) => c.y)) - padding);
    const maxY = Math.min(sourceHeight, Math.max(...corners.map((c) => c.y)) + padding);

    const cropWidth = maxX - minX;
    const cropHeight = maxY - minY;

    const canvas = document.createElement("canvas");
    canvas.width = cropWidth;
    canvas.height = cropHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(source, minX, minY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
    return canvas.toDataURL("image/png");
  } catch (e) {
    console.error("Crop error:", e);
    return null;
  }
}

/**
 * Core detection function that implements all strategies
 */
async function detectQRCodes(
  imageData: ImageData,
  source: HTMLImageElement | HTMLCanvasElement | null,
  options: Required<Omit<QRDetectionOptions, "onProgress">> & { onProgress?: QRDetectionOptions["onProgress"] }
): Promise<QRDetectionResult[]> {
  const results: QRDetectionResult[] = [];
  const sourceWidth = imageData.width;
  const sourceHeight = imageData.height;
  let aborted = false;

  const reportProgress = (strategy: string, progress: number, message: string, completedStrategies: string[]) => {
    if (options.onProgress) {
      options.onProgress({ strategy, progress, message, completedStrategies });
    }
  };

  const createResult = (
    decoded: { data: string; location: QRLocation },
    scaleX: number,
    scaleY: number,
    offsetX: number,
    offsetY: number,
    strategy: string,
    processedData?: ImageData
  ): QRDetectionResult => {
    const position = locationToPosition(decoded.location);

    // Adjust position based on scale and offset
    const adjustedPosition: QRPosition = {
      x: position.x * scaleX + offsetX,
      y: position.y * scaleY + offsetY,
      width: position.width * scaleX,
      height: position.height * scaleY,
    };

    return {
      data: decoded.data,
      position: adjustedPosition,
      location: decoded.location,
      croppedImageUrl: options.returnDetailedInfo && source ? cropQRCode(source, decoded.location, scaleX, scaleY, offsetX, offsetY) ?? undefined : undefined,
      processedImageUrl: options.returnDetailedInfo && processedData ? imageDataToUrl(processedData) : undefined,
      strategy,
    };
  };

  const completedStrategies: string[] = [];
  const useOpenCV = options.useOpenCV && opencvStatus.ready;

  // ============ STRATEGY T: Transparent/borderless QR (FIRST - like sample) ============
  reportProgress("Transparent QR", 5, "Checking for transparent/borderless QR...", completedStrategies);

  const flattenedBase = flattenTransparency(imageData);
  for (const padding of [40, 60, 80, 20]) {
    if (aborted) break;
    const padded = addQuietZone(flattenedBase, padding);
    const paddedScaleX = sourceWidth / (padded.width - padding * 2);
    const paddedScaleY = sourceHeight / (padded.height - padding * 2);
    const paddedOffsetX = -padding * paddedScaleX;
    const paddedOffsetY = -padding * paddedScaleY;

    let decoded = tryDecode(padded, `transparent-padded-${padding}`);
    if (decoded) {
      results.push(createResult(decoded, paddedScaleX, paddedScaleY, paddedOffsetX, paddedOffsetY, `Transparent QR (padding ${padding})`, padded));
      if (!options.detectMultiple) return results;
    }
    if (useOpenCV && options.kernelSize > 3) {
      const morphed = await sendWorkerMessage("morphology", { imageData: padded, kernelSize: options.kernelSize, shape: "ellipse" });
      if (morphed) {
        decoded = tryDecode(morphed, `transparent-morph-${padding}`);
        if (decoded) {
          results.push(createResult(decoded, paddedScaleX, paddedScaleY, paddedOffsetX, paddedOffsetY, `Transparent + Morph (Kernel ${options.kernelSize})`, morphed));
          if (!options.detectMultiple) return results;
        }
      }
    }
    const inverted = invertImage(padded);
    decoded = tryDecode(inverted, `transparent-inverted-${padding}`);
    if (decoded) {
      results.push(createResult(decoded, paddedScaleX, paddedScaleY, paddedOffsetX, paddedOffsetY, "Inverted transparent QR", inverted));
      if (!options.detectMultiple) return results;
    }
  }
  for (const scale of [1, 1.5, 2, 0.75]) {
    if (aborted) break;
    const width = Math.floor(sourceWidth * scale);
    const height = Math.floor(sourceHeight * scale);
    if (width * height > 4000000 || !source) continue;
    const scaledData = extractRegion(source, 0, 0, sourceWidth, sourceHeight, width, height);
    if (!scaledData) continue;
    const flattenedScaled = flattenTransparency(scaledData);
    const paddedScaled = addQuietZone(flattenedScaled, 50);
    const scaleX = sourceWidth / width;
    const scaleY = sourceHeight / height;
    const offsetX = -50 * scaleX;
    const offsetY = -50 * scaleY;
    let decodedScaled = tryDecode(paddedScaled, `transparent-scaled-${scale}x`);
    if (decodedScaled) {
      results.push(createResult(decodedScaled, scaleX, scaleY, offsetX, offsetY, `Transparent (${scale}x)`, paddedScaled));
      if (!options.detectMultiple) return results;
    }
    if (useOpenCV) {
      const morphed = await sendWorkerMessage("morphology", { imageData: paddedScaled, kernelSize: options.kernelSize, shape: "ellipse" });
      if (morphed) {
        decodedScaled = tryDecode(morphed, `transparent-scaled-morph-${scale}x`);
        if (decodedScaled) {
          results.push(createResult(decodedScaled, scaleX, scaleY, offsetX, offsetY, `Transparent + Morph (${scale}x)`, morphed));
          if (!options.detectMultiple) return results;
        }
      }
    }
  }
  completedStrategies.push("Transparent QR");

  // ============ STRATEGY C: Corner and edge region scan (like sample) ============
  if (source) {
    reportProgress("Corner Detection", 12, "Scanning corners and edges...", completedStrategies);
    const regions = [
      { name: "top-right", x: 0.7, y: 0, w: 0.3, h: 0.35 },
      { name: "top-left", x: 0, y: 0, w: 0.35, h: 0.35 },
      { name: "bottom-right", x: 0.65, y: 0.65, w: 0.35, h: 0.35 },
      { name: "bottom-left", x: 0, y: 0.65, w: 0.35, h: 0.35 },
      { name: "top-center", x: 0.25, y: 0, w: 0.5, h: 0.35 },
      { name: "top-edge", x: 0.2, y: 0, w: 0.6, h: 0.3 },
      { name: "center", x: 0.25, y: 0.25, w: 0.5, h: 0.5 },
    ];
    for (const region of regions) {
      if (aborted) break;
      const rx = Math.floor(sourceWidth * region.x);
      const ry = Math.floor(sourceHeight * region.y);
      const rw = Math.floor(sourceWidth * region.w);
      const rh = Math.floor(sourceHeight * region.h);
      for (const upscale of [2, 2.5, 3, 1.5]) {
        if (aborted) break;
        const targetWidth = Math.floor(rw * upscale);
        const targetHeight = Math.floor(rh * upscale);
        if (targetWidth * targetHeight > 3000000 || targetWidth < 100 || targetHeight < 100) continue;
        let regionData = extractRegion(source, rx, ry, rw, rh, targetWidth, targetHeight);
        if (!regionData) continue;
        regionData = flattenTransparency(regionData);
        const paddedRegion = addQuietZone(regionData, 40);
        const scaleX = rw / targetWidth;
        const scaleY = rh / targetHeight;

        let decoded = tryDecode(paddedRegion, `corner-${region.name}-${upscale}x`);
        if (decoded) {
          results.push(createResult(decoded, scaleX, scaleY, rx, ry, `Corner QR (${region.name})`, paddedRegion));
          if (!options.detectMultiple) return results;
        }
        if (useOpenCV) {
          const morphed = await sendWorkerMessage("morphology", { imageData: paddedRegion, kernelSize: options.kernelSize, shape: "ellipse" });
          if (morphed) {
            decoded = tryDecode(morphed, `corner-morph-${region.name}`);
            if (decoded) {
              results.push(createResult(decoded, scaleX, scaleY, rx, ry, `Corner QR + Morph (${region.name})`, morphed));
              if (!options.detectMultiple) return results;
            }
          }
          const invRegion = invertImage(paddedRegion);
          decoded = tryDecode(invRegion, `corner-inverted-${region.name}`);
          if (decoded) {
            results.push(createResult(decoded, scaleX, scaleY, rx, ry, `Inverted corner (${region.name})`, invRegion));
            if (!options.detectMultiple) return results;
          }
          for (const ac of [{ blockSize: 21, c: 5 }, { blockSize: 11, c: 2 }, { blockSize: 31, c: 8 }]) {
            const adaptive = await sendWorkerMessage("adaptive-threshold", { imageData: paddedRegion, blockSize: ac.blockSize, c: ac.c });
            if (adaptive) {
              decoded = tryDecode(adaptive, `corner-adaptive-${region.name}`);
              if (decoded) {
                results.push(createResult(decoded, scaleX, scaleY, rx, ry, `Corner adaptive (${region.name})`, adaptive));
                if (!options.detectMultiple) return results;
              }
            }
          }
          const otsuR = await sendWorkerMessage("otsu-threshold", { imageData: paddedRegion });
          if (otsuR) {
            decoded = tryDecode(otsuR, `corner-otsu-${region.name}`);
            if (decoded) {
              results.push(createResult(decoded, scaleX, scaleY, rx, ry, `Corner Otsu (${region.name})`, otsuR));
              if (!options.detectMultiple) return results;
            }
          }
          const sharpR = await sendWorkerMessage("sharpen", { imageData: paddedRegion });
          if (sharpR) {
            decoded = tryDecode(sharpR, `corner-sharp-${region.name}`);
            if (decoded) {
              results.push(createResult(decoded, scaleX, scaleY, rx, ry, `Corner sharp (${region.name})`, sharpR));
              if (!options.detectMultiple) return results;
            }
            const hpR = await sendWorkerMessage("highpass", { imageData: paddedRegion, strength: 2 });
            if (hpR) {
              decoded = tryDecode(hpR, `corner-highpass-${region.name}`);
              if (decoded) {
                results.push(createResult(decoded, scaleX, scaleY, rx, ry, `Corner high-pass (${region.name})`, hpR));
                if (!options.detectMultiple) return results;
              }
            }
          }
        }
      }
    }
    completedStrategies.push("Corner Detection");
  }

  // ============ STRATEGY D: Dot-style QR (like sample) ============
  if (useOpenCV) {
    reportProgress("Dot-style QR", 22, "Checking for dot-style QR codes...", completedStrategies);
    const dotConfigs = [
      { dilate: 5, close: 9 }, { dilate: 7, close: 11 }, { dilate: 9, close: 13 }, { dilate: 11, close: 15 },
      { dilate: 13, close: 17 }, { dilate: 7, close: 15 }, { dilate: 9, close: 17 }, { dilate: 15, close: 21 }, { dilate: 17, close: 23 },
    ];
    const openCloseConfigs = [
      { open: 3, close: 9 }, { open: 5, close: 11 }, { open: 3, close: 13 }, { open: 5, close: 15 }, { open: 7, close: 17 },
    ];
    const largeKernels = [21, 25, 29, 33, 37, 41];

    for (const scale of [1, 0.75, 0.5, 1.5]) {
      if (aborted) break;
      const width = Math.floor(sourceWidth * scale);
      const height = Math.floor(sourceHeight * scale);
      if (width * height > 4000000 || width < 200 || height < 200) continue;
      let scaleData: ImageData | null = scale === 1 ? imageData : source ? extractRegion(source, 0, 0, sourceWidth, sourceHeight, width, height) : null;
      if (!scaleData) continue;
      scaleData = flattenTransparency(scaleData);
      const paddedData = addQuietZone(scaleData, 50);
      const scaleX = sourceWidth / width;
      const scaleY = sourceHeight / height;
      const offX = -50 * scaleX;
      const offY = -50 * scaleY;

      for (const config of dotConfigs) {
        if (aborted) break;
        const dotMorphed = await sendWorkerMessage("dot-morphology", { imageData: paddedData, dilateSize: config.dilate, closeSize: config.close });
        if (dotMorphed) {
          const decoded = tryDecode(dotMorphed, `dot-style-d${config.dilate}-c${config.close}`);
          if (decoded) {
            results.push(createResult(decoded, scaleX, scaleY, offX, offY, `Dot QR (d${config.dilate}/c${config.close})`, dotMorphed));
            if (!options.detectMultiple) return results;
          }
        }
      }
      for (const config of openCloseConfigs) {
        if (aborted) break;
        const ocMorphed = await sendWorkerMessage("open-close-morphology", { imageData: paddedData, openSize: config.open, closeSize: config.close });
        if (ocMorphed) {
          const decoded = tryDecode(ocMorphed, `open-close-o${config.open}-c${config.close}`);
          if (decoded) {
            results.push(createResult(decoded, scaleX, scaleY, offX, offY, `Dot QR open-close (o${config.open}/c${config.close})`, ocMorphed));
            if (!options.detectMultiple) return results;
          }
        }
      }
      for (const k of largeKernels) {
        if (aborted) break;
        const largeMorphed = await sendWorkerMessage("morphology", { imageData: paddedData, kernelSize: k, shape: "ellipse" });
        if (largeMorphed) {
          const decoded = tryDecode(largeMorphed, `dot-large-k${k}`);
          if (decoded) {
            results.push(createResult(decoded, scaleX, scaleY, offX, offY, `Dot QR (kernel ${k})`, largeMorphed));
            if (!options.detectMultiple) return results;
          }
        }
      }
    }
    completedStrategies.push("Dot-style QR");
  }

  // ============ STRATEGY 0: User-selected kernel ============
  if (useOpenCV && options.kernelSize > 3) {
    reportProgress("User Kernel", 32, `User-selected kernel (${options.kernelSize}×${options.kernelSize})...`, completedStrategies);
    for (const scale of [1, 0.75, 1.25, 1.5]) {
      if (aborted) break;
      const width = Math.floor(sourceWidth * scale);
      const height = Math.floor(sourceHeight * scale);
      if (width * height > 4000000 || !source) continue;
      const rawScale = scale === 1 ? imageData : extractRegion(source, 0, 0, sourceWidth, sourceHeight, width, height);
      if (!rawScale) continue;
      const scaleData = flattenTransparency(rawScale);
      const scaleX = sourceWidth / width;
      const scaleY = sourceHeight / height;

      const morphedE = await sendWorkerMessage("morphology", { imageData: scaleData, kernelSize: options.kernelSize, shape: "ellipse" });
      if (morphedE) {
        const decoded = tryDecode(morphedE, `user-kernel-ellipse-${scale}x`);
        if (decoded) {
          results.push(createResult(decoded, scaleX, scaleY, 0, 0, `Morphology (Kernel ${options.kernelSize})`, morphedE));
          if (!options.detectMultiple) return results;
        }
      }
      const morphedR = await sendWorkerMessage("morphology", { imageData: scaleData, kernelSize: options.kernelSize, shape: "rect" });
      if (morphedR) {
        const decoded = tryDecode(morphedR, `user-kernel-rect-${scale}x`);
        if (decoded) {
          results.push(createResult(decoded, scaleX, scaleY, 0, 0, `Morphology rect (Kernel ${options.kernelSize})`, morphedR));
          if (!options.detectMultiple) return results;
        }
      }
    }
    completedStrategies.push("User Kernel");
  }

  // ============ STRATEGY 1: Raw image at multiple scales ============
  reportProgress("Raw Image", 38, "Trying raw image...", completedStrategies);

  const scales = [1, 0.75, 0.5, 1.25, 1.5, 2];
  for (const scale of scales) {
    if (aborted) break;
    const width = Math.floor(sourceWidth * scale);
    const height = Math.floor(sourceHeight * scale);
    if (width * height > 4000000) continue;
    let scaledData: ImageData | null = scale === 1 ? imageData : source ? extractRegion(source, 0, 0, sourceWidth, sourceHeight, width, height) : null;
    if (!scaledData) continue;
    scaledData = flattenTransparency(scaledData);
    const scaleX = sourceWidth / width;
    const scaleY = sourceHeight / height;
    const decoded = tryDecode(scaledData, `raw-${scale}x`);
    if (decoded) {
      results.push(createResult(decoded, scaleX, scaleY, 0, 0, `Raw image (${scale}x)`, scaledData));
      if (!options.detectMultiple) return results;
    }
  }
  completedStrategies.push("Raw Image");

  // ============ STRATEGY 2: Stylized QR with user kernel only ============
  if (useOpenCV) {
    reportProgress("Morphology", 45, `Stylized QR with user kernel (${options.kernelSize}×${options.kernelSize})...`, completedStrategies);
    for (const scale of [1, 0.75, 1.25, 0.5, 1.5, 2]) {
      if (aborted) break;
      const width = Math.floor(sourceWidth * scale);
      const height = Math.floor(sourceHeight * scale);
      if (width * height > 4000000 || !source) continue;
      const rawScale = scale === 1 ? imageData : extractRegion(source, 0, 0, sourceWidth, sourceHeight, width, height);
      if (!rawScale) continue;
      const scaleData = flattenTransparency(rawScale);
      const scaleX = sourceWidth / width;
      const scaleY = sourceHeight / height;

      const morphedE = await sendWorkerMessage("morphology", { imageData: scaleData, kernelSize: options.kernelSize, shape: "ellipse" });
      if (morphedE) {
        const decoded = tryDecode(morphedE, `morph-ellipse-${scale}x`);
        if (decoded) {
          results.push(createResult(decoded, scaleX, scaleY, 0, 0, `Morphology (Kernel ${options.kernelSize})`, morphedE));
          if (!options.detectMultiple) return results;
        }
      }
      const morphedR = await sendWorkerMessage("morphology", { imageData: scaleData, kernelSize: options.kernelSize, shape: "rect" });
      if (morphedR) {
        const decoded = tryDecode(morphedR, `morph-rect-${scale}x`);
        if (decoded) {
          results.push(createResult(decoded, scaleX, scaleY, 0, 0, `Morphology rect (Kernel ${options.kernelSize})`, morphedR));
          if (!options.detectMultiple) return results;
        }
      }
    }
    completedStrategies.push("Morphology");
  }

  // ============ STRATEGY 3: Adaptive threshold ============
  if (useOpenCV) {
    reportProgress("Adaptive Threshold", 55, "Applying adaptive threshold...", completedStrategies);
    const adaptiveConfigs = [
      { blockSize: 11, c: 2 }, { blockSize: 15, c: 3 }, { blockSize: 21, c: 5 }, { blockSize: 31, c: 8 },
    ];
    for (const scale of [1, 0.75, 1.5]) {
      if (aborted) break;
      const width = Math.floor(sourceWidth * scale);
      const height = Math.floor(sourceHeight * scale);
      if (width * height > 3000000 || !source) continue;
      const rawScale = scale === 1 ? imageData : extractRegion(source, 0, 0, sourceWidth, sourceHeight, width, height);
      if (!rawScale) continue;
      const scaleData = flattenTransparency(rawScale);
      const scaleX = sourceWidth / width;
      const scaleY = sourceHeight / height;
      for (const config of adaptiveConfigs) {
        const adaptive = await sendWorkerMessage("adaptive-threshold", { imageData: scaleData, blockSize: config.blockSize, c: config.c });
        if (adaptive) {
          const decoded = tryDecode(adaptive, `adaptive-b${config.blockSize}`);
          if (decoded) {
            results.push(createResult(decoded, scaleX, scaleY, 0, 0, `Adaptive threshold (block ${config.blockSize})`, adaptive));
            if (!options.detectMultiple) return results;
          }
        }
      }
    }
    completedStrategies.push("Adaptive Threshold");
  }

  // ============ STRATEGY 4: Sharpening and deblurring ============
  if (useOpenCV) {
    reportProgress("Sharpening", 65, "Applying sharpening...", completedStrategies);
    const flat = flattenTransparency(imageData);
    const sharpened = await sendWorkerMessage("sharpen", { imageData: flat });
    if (sharpened) {
      let decoded = tryDecode(sharpened, "sharpened");
      if (decoded) {
        results.push(createResult(decoded, 1, 1, 0, 0, "Sharpened", sharpened));
        if (!options.detectMultiple) return results;
      }
      const sharpMorphed = await sendWorkerMessage("morphology", { imageData: sharpened, kernelSize: options.kernelSize, shape: "ellipse" });
      if (sharpMorphed) {
        decoded = tryDecode(sharpMorphed, "sharp-morph");
        if (decoded) {
          results.push(createResult(decoded, 1, 1, 0, 0, `Sharpened + morph (Kernel ${options.kernelSize})`, sharpMorphed));
          if (!options.detectMultiple) return results;
        }
      }
    }
    for (const strength of [1.5, 2.5]) {
      const unsharp = await sendWorkerMessage("unsharp", { imageData: flat, strength, radius: 1 });
      if (unsharp) {
        const decoded = tryDecode(unsharp, `unsharp-s${strength}`);
        if (decoded) {
          results.push(createResult(decoded, 1, 1, 0, 0, `Unsharp mask (strength ${strength})`, unsharp));
          if (!options.detectMultiple) return results;
        }
      }
    }
    const hp = await sendWorkerMessage("highpass", { imageData: flat, strength: 1 });
    if (hp) {
      const decoded = tryDecode(hp, "highpass");
      if (decoded) {
        results.push(createResult(decoded, 1, 1, 0, 0, "High-pass sharpening", hp));
        if (!options.detectMultiple) return results;
      }
    }
    const otsu = await sendWorkerMessage("otsu-threshold", { imageData: flat });
    if (otsu) {
      const decoded = tryDecode(otsu, "otsu");
      if (decoded) {
        results.push(createResult(decoded, 1, 1, 0, 0, "Otsu threshold", otsu));
        if (!options.detectMultiple) return results;
      }
    }
    completedStrategies.push("Sharpening");
  }

  // ============ STRATEGY 5: Sliding window (like sample) ============
  if (source) {
    reportProgress("Sliding Window", 78, "Sliding window scan...", completedStrategies);
    const windowRatios = [0.5, 0.4, 0.3];
    const gridSteps = 3;
    for (const windowRatio of windowRatios) {
      if (aborted) break;
      const windowWidth = Math.floor(sourceWidth * windowRatio);
      const windowHeight = Math.floor(sourceHeight * windowRatio);
      const stepX = Math.floor((sourceWidth - windowWidth) / (gridSteps - 1)) || 1;
      const stepY = Math.floor((sourceHeight - windowHeight) / (gridSteps - 1)) || 1;
      for (let gy = 0; gy < gridSteps; gy++) {
        for (let gx = 0; gx < gridSteps; gx++) {
          if (aborted) break;
          const sx = Math.min(gx * stepX, sourceWidth - windowWidth);
          const sy = Math.min(gy * stepY, sourceHeight - windowHeight);
          const targetScale = windowRatio < 0.4 ? 2.5 : 2;
          const targetWidth = Math.floor(windowWidth * targetScale);
          const targetHeight = Math.floor(windowHeight * targetScale);
          if (targetWidth * targetHeight > 2000000) continue;
          const windowData = extractRegion(source, sx, sy, windowWidth, windowHeight, targetWidth, targetHeight);
          if (!windowData) continue;
          const scaleX = windowWidth / targetWidth;
          const scaleY = windowHeight / targetHeight;
          let decoded = tryDecode(flattenTransparency(windowData), `window-${windowRatio}`);
          if (decoded) {
            results.push(createResult(decoded, scaleX, scaleY, sx, sy, `Window ${Math.round(windowRatio * 100)}%`, windowData));
            if (!options.detectMultiple) return results;
          }
          if (useOpenCV) {
            const morphed = await sendWorkerMessage("morphology", { imageData: flattenTransparency(windowData), kernelSize: options.kernelSize, shape: "ellipse" });
            if (morphed) {
              decoded = tryDecode(morphed, `window-morph-${windowRatio}`);
              if (decoded) {
                results.push(createResult(decoded, scaleX, scaleY, sx, sy, `Window morph (Kernel ${options.kernelSize})`, morphed));
                if (!options.detectMultiple) return results;
              }
            }
          }
        }
      }
    }
    completedStrategies.push("Sliding Window");
  }

  // ============ STRATEGY 6: Final attempt with user kernel at resolutions ============
  if (useOpenCV && source) {
    reportProgress("Final Kernel", 88, `Final attempt with user kernel (${options.kernelSize}×${options.kernelSize})...`, completedStrategies);
    for (const maxDim of [1200, 800, 600, 400]) {
      if (aborted) break;
      const w = Math.min(sourceWidth, maxDim);
      const h = Math.min(sourceHeight, maxDim);
      const resData = extractRegion(source, 0, 0, sourceWidth, sourceHeight, w, h);
      if (!resData) continue;
      const scaleX = sourceWidth / w;
      const scaleY = sourceHeight / h;
      const morphed = await sendWorkerMessage("morphology", { imageData: flattenTransparency(resData), kernelSize: options.kernelSize, shape: "ellipse" });
      if (morphed) {
        const decoded = tryDecode(morphed, `final-morph-${maxDim}`);
        if (decoded) {
          results.push(createResult(decoded, scaleX, scaleY, 0, 0, `Morphology (Kernel ${options.kernelSize})`, morphed));
          if (!options.detectMultiple) return results;
        }
      }
    }
    completedStrategies.push("Final Kernel");
  }

  reportProgress("Complete", 100, "Detection complete", completedStrategies);

  return results;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Detect QR codes from a File (image)
 * 
 * @example
 * ```typescript
 * const results = await detect(imageFile);
 * if (results.length > 0) {
 *   console.log('QR data:', results[0].data);
 * }
 * ```
 */
export async function detect(
  file: File,
  options?: QRDetectionOptions
): Promise<QRDetectionResult[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Initialize OpenCV if needed
  if (opts.useOpenCV && !opencvStatus.ready && !opencvStatus.loading) {
    await initOpenCVWorker();
  }

  const img = await loadImageFromFile(file);
  const imageData = getImageData(img, opts.maxImageSize);

  if (!imageData) {
    throw new Error("Failed to get image data");
  }

  return detectQRCodes(imageData, img, opts);
}

/**
 * Detect QR codes from an image URL
 * 
 * @example
 * ```typescript
 * const results = await detectFromUrl('https://example.com/qr.png');
 * ```
 */
export async function detectFromUrl(
  url: string,
  options?: QRDetectionOptions
): Promise<QRDetectionResult[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Initialize OpenCV if needed
  if (opts.useOpenCV && !opencvStatus.ready && !opencvStatus.loading) {
    await initOpenCVWorker();
  }

  const img = await loadImageFromUrl(url);
  const imageData = getImageData(img, opts.maxImageSize);

  if (!imageData) {
    throw new Error("Failed to get image data");
  }

  return detectQRCodes(imageData, img, opts);
}

/**
 * Detect QR codes from an HTMLImageElement, HTMLCanvasElement, or HTMLVideoElement
 * 
 * @example
 * ```typescript
 * const canvas = document.getElementById('qr-canvas');
 * const results = await detectFromElement(canvas);
 * ```
 */
export async function detectFromElement(
  element: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
  options?: QRDetectionOptions
): Promise<QRDetectionResult[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Initialize OpenCV if needed
  if (opts.useOpenCV && !opencvStatus.ready && !opencvStatus.loading) {
    await initOpenCVWorker();
  }

  const imageData = getImageData(element, opts.maxImageSize);

  if (!imageData) {
    throw new Error("Failed to get image data");
  }

  const source = element instanceof HTMLVideoElement ? null : element;
  return detectQRCodes(imageData, source, opts);
}

/**
 * Detect QR codes from ImageData
 * 
 * @example
 * ```typescript
 * const ctx = canvas.getContext('2d');
 * const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
 * const results = await detectFromImageData(imageData);
 * ```
 */
export async function detectFromImageData(
  imageData: ImageData,
  options?: QRDetectionOptions
): Promise<QRDetectionResult[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Initialize OpenCV if needed
  if (opts.useOpenCV && !opencvStatus.ready && !opencvStatus.loading) {
    await initOpenCVWorker();
  }

  return detectQRCodes(imageData, null, opts);
}

/**
 * Simple function to quickly check if an image contains a readable QR code
 * 
 * @example
 * ```typescript
 * const isReadable = await isQRCodeReadable(imageFile);
 * ```
 */
export async function isQRCodeReadable(file: File): Promise<boolean> {
  try {
    const results = await detect(file, { returnDetailedInfo: false });
    return results.length > 0;
  } catch {
    return false;
  }
}

/**
 * Verify if a QR code contains the expected data
 * 
 * @example
 * ```typescript
 * const isValid = await verifyQRCode(imageFile, 'https://example.com');
 * ```
 */
export async function verifyQRCode(
  file: File,
  expectedData: string,
  options?: QRDetectionOptions
): Promise<{ valid: boolean; actualData?: string; result?: QRDetectionResult }> {
  try {
    const results = await detect(file, options);

    if (results.length === 0) {
      return { valid: false };
    }

    const matchingResult = results.find((r) => r.data === expectedData);

    if (matchingResult) {
      return { valid: true, actualData: matchingResult.data, result: matchingResult };
    }

    return { valid: false, actualData: results[0].data, result: results[0] };
  } catch {
    return { valid: false };
  }
}

// Export types
export type {
  QRDetectionResult,
  QRDetectionOptions,
  QRPosition,
  QRLocation,
  FinderPattern,
  DetectionProgress,
  OpenCVStatus,
};
