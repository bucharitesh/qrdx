/**
 * OpenCV Web Worker for QR Code Detection
 * 
 * This worker handles heavy image processing operations using OpenCV.js
 * loaded from CDN, keeping the main thread responsive.
 */

/// <reference lib="webworker" />

// Web Worker globals declaration
declare function importScripts(...urls: string[]): void;
declare const self: DedicatedWorkerGlobalScope;

import type {
  FinderPattern,
  OpenCVWorkerMessage,
  OpenCVWorkerResponse,
  QRDetectionOptions,
  QRDetectionResult,
} from "../../types/detection";

// OpenCV type declarations
declare const cv: OpenCVInstance;

interface CVMat {
  data: Uint8Array;
  data32S: Int32Array;
  channels: () => number;
  clone: () => CVMat;
  delete: () => void;
  rows: number;
  cols: number;
}

interface CVMatVector {
  size: () => number;
  get: (index: number) => CVMat;
  delete: () => void;
}

interface OpenCVInstance {
  Mat: {
    new(): CVMat;
    zeros: (rows: number, cols: number, type: number) => CVMat;
  };
  MatVector: new () => CVMatVector;
  Size: new (width: number, height: number) => { width: number; height: number };
  matFromImageData: (data: ImageData) => CVMat;
  cvtColor: (src: CVMat, dst: CVMat, code: number) => void;
  bitwise_not: (src: CVMat, dst: CVMat) => void;
  getStructuringElement: (shape: number, size: { width: number; height: number }) => CVMat;
  morphologyEx: (src: CVMat, dst: CVMat, op: number, kernel: CVMat) => void;
  threshold: (src: CVMat, dst: CVMat, thresh: number, maxval: number, type: number) => void;
  adaptiveThreshold: (src: CVMat, dst: CVMat, maxValue: number, adaptiveMethod: number, thresholdType: number, blockSize: number, C: number) => void;
  GaussianBlur: (src: CVMat, dst: CVMat, ksize: { width: number; height: number }, sigmaX: number) => void;
  filter2D: (src: CVMat, dst: CVMat, ddepth: number, kernel: CVMat, anchor: { x: number; y: number }, delta: number, borderType: number) => void;
  findContours: (src: CVMat, contours: CVMatVector, hierarchy: CVMat, mode: number, method: number) => void;
  contourArea: (contour: CVMat) => number;
  boundingRect: (contour: CVMat) => { x: number; y: number; width: number; height: number };
  COLOR_RGBA2GRAY: number;
  COLOR_GRAY2RGBA: number;
  MORPH_ELLIPSE: number;
  MORPH_RECT: number;
  MORPH_CLOSE: number;
  MORPH_DILATE: number;
  THRESH_BINARY: number;
  THRESH_BINARY_INV: number;
  THRESH_OTSU: number;
  ADAPTIVE_THRESH_GAUSSIAN_C: number;
  RETR_TREE: number;
  CHAIN_APPROX_SIMPLE: number;
  CV_8U: number;
  CV_32F: number;
  BORDER_DEFAULT: number;
  onRuntimeInitialized?: () => void;
}

let cvReady = false;

// Post message helper with type safety
function postResponse(response: OpenCVWorkerResponse) {
  self.postMessage(response);
}

/**
 * Load OpenCV.js from CDN
 */
async function initOpenCV(opencvUrl: string): Promise<void> {
  if (cvReady) {
    postResponse({ type: "init-success" });
    return;
  }

  postResponse({ type: "init-progress", progress: 10, status: "Downloading OpenCV.js..." });

  try {
    // Import the script
    importScripts(opencvUrl);
    
    postResponse({ type: "init-progress", progress: 60, status: "Initializing WebAssembly..." });

    // Wait for OpenCV to initialize
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("OpenCV initialization timeout"));
      }, 30000);

      const checkInterval = setInterval(() => {
        if (typeof cv !== "undefined" && cv.Mat) {
          clearInterval(checkInterval);
          clearTimeout(timeout);
          resolve();
        }
      }, 100);

      // Also check onRuntimeInitialized
      if (typeof cv !== "undefined" && cv.onRuntimeInitialized !== undefined) {
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
    postResponse({ type: "init-progress", progress: 100, status: "Ready" });
    postResponse({ type: "init-success" });
  } catch (error) {
    postResponse({ 
      type: "init-error", 
      error: error instanceof Error ? error.message : "Failed to initialize OpenCV" 
    });
  }
}

/**
 * Apply morphological operations to connect/fill QR code patterns
 */
function applyMorphology(
  imageData: ImageData,
  kernelSize: number,
  shape: "ellipse" | "rect"
): ImageData | null {
  if (!cvReady) return null;

  try {
    const src = cv.matFromImageData(imageData);
    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    const inverted = new cv.Mat();
    cv.bitwise_not(gray, inverted);

    const kernel = cv.getStructuringElement(
      shape === "ellipse" ? cv.MORPH_ELLIPSE : cv.MORPH_RECT,
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

    // Cleanup
    src.delete();
    gray.delete();
    inverted.delete();
    kernel.delete();
    closed.delete();
    final.delete();
    rgba.delete();

    return result;
  } catch (e) {
    console.error("Morphology error:", e);
    return null;
  }
}

/**
 * Apply adaptive threshold for better QR detection
 */
function applyAdaptiveThreshold(
  imageData: ImageData,
  blockSize: number,
  c: number
): ImageData | null {
  if (!cvReady) return null;

  try {
    const src = cv.matFromImageData(imageData);
    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    const thresholded = new cv.Mat();
    cv.adaptiveThreshold(
      gray,
      thresholded,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY,
      blockSize,
      c
    );

    const rgba = new cv.Mat();
    cv.cvtColor(thresholded, rgba, cv.COLOR_GRAY2RGBA);

    const result = new ImageData(
      new Uint8ClampedArray(rgba.data),
      imageData.width,
      imageData.height
    );

    // Cleanup
    src.delete();
    gray.delete();
    thresholded.delete();
    rgba.delete();

    return result;
  } catch (e) {
    console.error("Adaptive threshold error:", e);
    return null;
  }
}

/**
 * Apply Otsu threshold
 */
function applyOtsuThreshold(imageData: ImageData): ImageData | null {
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

    // Cleanup
    src.delete();
    gray.delete();
    blurred.delete();
    thresholded.delete();
    rgba.delete();

    return result;
  } catch (e) {
    console.error("Otsu threshold error:", e);
    return null;
  }
}

/**
 * Apply dot-style morphology for QRs with circular dots
 */
function applyDotStyleMorphology(
  imageData: ImageData,
  dilateSize: number,
  closeSize: number
): ImageData | null {
  if (!cvReady) return null;

  try {
    const src = cv.matFromImageData(imageData);
    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    const inverted = new cv.Mat();
    cv.bitwise_not(gray, inverted);

    // Heavy dilation to expand dots
    const dilateKernel = cv.getStructuringElement(
      cv.MORPH_ELLIPSE,
      new cv.Size(dilateSize, dilateSize)
    );
    const dilated = new cv.Mat();
    cv.morphologyEx(inverted, dilated, cv.MORPH_DILATE, dilateKernel);

    // Closing to connect nearby dots
    const closeKernel = cv.getStructuringElement(
      cv.MORPH_RECT,
      new cv.Size(closeSize, closeSize)
    );
    const closed = new cv.Mat();
    cv.morphologyEx(dilated, closed, cv.MORPH_CLOSE, closeKernel);

    // Invert back
    const final = new cv.Mat();
    cv.bitwise_not(closed, final);

    const rgba = new cv.Mat();
    cv.cvtColor(final, rgba, cv.COLOR_GRAY2RGBA);

    const result = new ImageData(
      new Uint8ClampedArray(rgba.data),
      imageData.width,
      imageData.height
    );

    // Cleanup
    src.delete();
    gray.delete();
    inverted.delete();
    dilateKernel.delete();
    dilated.delete();
    closeKernel.delete();
    closed.delete();
    final.delete();
    rgba.delete();

    return result;
  } catch (e) {
    console.error("Dot-style morphology error:", e);
    return null;
  }
}

/**
 * Apply sharpening filter
 */
function sharpenImage(imageData: ImageData): ImageData | null {
  if (!cvReady) return null;

  try {
    const src = cv.matFromImageData(imageData);
    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // Create sharpening kernel
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

    // Cleanup
    src.delete();
    gray.delete();
    kernel.delete();
    filtered.delete();
    rgba.delete();

    return result;
  } catch (e) {
    console.error("Sharpen error:", e);
    return null;
  }
}

/**
 * Detect finder patterns (corner eyes) in a QR code image
 */
function detectFinderPatterns(imageData: ImageData): FinderPattern[] {
  if (!cvReady) return [];

  try {
    const src = cv.matFromImageData(imageData);
    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // Adaptive threshold for better binarization
    const binary = new cv.Mat();
    cv.adaptiveThreshold(gray, binary, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 25, 10);

    // Find contours with hierarchy
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(binary, contours, hierarchy, cv.RETR_TREE, cv.CHAIN_APPROX_SIMPLE);

    const hierarchyData = hierarchy.data32S;
    const candidates: FinderPattern[] = [];
    const imgArea = imageData.width * imageData.height;

    // Analyze each contour for finder pattern characteristics
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);
      const rect = cv.boundingRect(contour);

      // Skip very small or very large contours
      if (area < imgArea * 0.0005 || area > imgArea * 0.6) continue;

      // Aspect ratio check
      const aspectRatio = rect.width / rect.height;
      if (aspectRatio < 0.5 || aspectRatio > 2.0) continue;

      // Count nesting level
      let nestingLevel = 0;
      let childIdx = hierarchyData[i * 4 + 2]; // first_child
      while (childIdx !== -1 && nestingLevel < 10) {
        nestingLevel++;
        childIdx = hierarchyData[childIdx * 4 + 2];
      }

      // Count parent levels
      let parentLevel = 0;
      let parentIdx = hierarchyData[i * 4 + 3]; // parent
      while (parentIdx !== -1 && parentLevel < 10) {
        parentLevel++;
        parentIdx = hierarchyData[parentIdx * 4 + 3];
      }

      // We want the outermost contour
      if (parentLevel === 0) {
        candidates.push({
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          centerX: rect.x + rect.width / 2,
          centerY: rect.y + rect.height / 2,
          area: rect.width * rect.height,
          nestingLevel,
        });
      }
    }

    // Cleanup
    src.delete();
    gray.delete();
    binary.delete();
    contours.delete();
    hierarchy.delete();

    // Sort by area (descending)
    candidates.sort((a, b) => b.area - a.area);

    // Group nearby candidates
    const grouped: FinderPattern[] = [];
    for (const c of candidates) {
      let merged = false;
      for (const g of grouped) {
        const dist = Math.sqrt((c.centerX - g.centerX) ** 2 + (c.centerY - g.centerY) ** 2);
        if (dist < Math.max(c.width, g.width) * 0.5) {
          if (c.nestingLevel > g.nestingLevel || (c.nestingLevel === g.nestingLevel && c.area > g.area)) {
            Object.assign(g, c);
          }
          merged = true;
          break;
        }
      }
      if (!merged) {
        grouped.push({ ...c });
      }
    }

    // Find the best triplet that forms a right angle
    if (grouped.length < 3) {
      return grouped;
    }

    let bestTriplet: FinderPattern[] = [];
    let bestScore = -1;
    const topCandidates = grouped.slice(0, Math.min(12, grouped.length));

    for (let i = 0; i < topCandidates.length - 2; i++) {
      for (let j = i + 1; j < topCandidates.length - 1; j++) {
        for (let k = j + 1; k < topCandidates.length; k++) {
          const p1 = topCandidates[i];
          const p2 = topCandidates[j];
          const p3 = topCandidates[k];

          // Check if sizes are roughly similar
          const sizes = [p1.area, p2.area, p3.area].sort((a, b) => a - b);
          const sizeRatio = sizes[0] / sizes[2];
          if (sizeRatio < 0.2) continue;

          // Calculate distances
          const d12 = Math.sqrt((p1.centerX - p2.centerX) ** 2 + (p1.centerY - p2.centerY) ** 2);
          const d13 = Math.sqrt((p1.centerX - p3.centerX) ** 2 + (p1.centerY - p3.centerY) ** 2);
          const d23 = Math.sqrt((p2.centerX - p3.centerX) ** 2 + (p2.centerY - p3.centerY) ** 2);

          const distances = [
            { d: d12 },
            { d: d13 },
            { d: d23 },
          ].sort((a, b) => b.d - a.d);

          const diagonal = distances[0].d;
          const side1 = distances[1].d;
          const side2 = distances[2].d;

          // Check right-angle property
          const expectedDiagonal = Math.sqrt(side1 * side1 + side2 * side2);
          const diagonalError = Math.abs(diagonal - expectedDiagonal) / expectedDiagonal;
          const sideRatio = Math.min(side1, side2) / Math.max(side1, side2);

          const nestingBonus = (p1.nestingLevel + p2.nestingLevel + p3.nestingLevel) * 20;
          const score = sizeRatio * 100 + (1 - diagonalError) * 100 + sideRatio * 50 + nestingBonus;

          if (diagonalError < 0.35 && sideRatio > 0.4 && score > bestScore) {
            bestScore = score;
            bestTriplet = [p1, p2, p3];
          }
        }
      }
    }

    if (bestTriplet.length === 3) {
      return bestTriplet;
    }

    return grouped.slice(0, 6);
  } catch (e) {
    console.error("Finder pattern detection error:", e);
    return [];
  }
}

// Message handler
self.onmessage = async (event: MessageEvent<OpenCVWorkerMessage>) => {
  const message = event.data;

  switch (message.type) {
    case "init":
      await initOpenCV(message.opencvUrl);
      break;

    case "applyMorphology": {
      const result = applyMorphology(message.imageData, message.kernelSize, message.shape);
      if (result) {
        postResponse({ type: "morphology-success", imageData: result });
      } else {
        postResponse({ type: "morphology-error", error: "Failed to apply morphology" });
      }
      break;
    }

    case "applyAdaptiveThreshold": {
      const result = applyAdaptiveThreshold(message.imageData, message.blockSize, message.c);
      if (result) {
        postResponse({ type: "threshold-success", imageData: result });
      } else {
        postResponse({ type: "threshold-error", error: "Failed to apply adaptive threshold" });
      }
      break;
    }

    case "detectFinderPatterns": {
      const patterns = detectFinderPatterns(message.imageData);
      postResponse({ type: "finder-patterns-success", patterns });
      break;
    }

    case "abort":
      // Handle abort - worker will stop processing
      break;
  }
};

// Export types and functions for use in the main detection module
export {
  applyMorphology,
  applyAdaptiveThreshold,
  applyOtsuThreshold,
  applyDotStyleMorphology,
  sharpenImage,
  detectFinderPatterns,
};
