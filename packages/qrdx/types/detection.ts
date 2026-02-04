import { z } from "zod";

/**
 * Position of a detected QR code in the image
 */
export interface QRPosition {
  /** X coordinate of the top-left corner */
  x: number;
  /** Y coordinate of the top-left corner */
  y: number;
  /** Width of the QR code bounding box */
  width: number;
  /** Height of the QR code bounding box */
  height: number;
}

/**
 * Corner locations of a detected QR code
 */
export interface QRLocation {
  topLeftCorner: { x: number; y: number };
  topRightCorner: { x: number; y: number };
  bottomLeftCorner: { x: number; y: number };
  bottomRightCorner: { x: number; y: number };
}

/**
 * Finder pattern (corner eye) detected in a QR code
 */
export interface FinderPattern {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  area: number;
  nestingLevel: number;
}

/**
 * Result of QR code detection
 */
export interface QRDetectionResult {
  /** Decoded data from the QR code */
  data: string;
  /** Position and size of the QR code in the image */
  position: QRPosition;
  /** Corner locations of the QR code */
  location?: QRLocation;
  /** Cropped image of the QR code as data URL */
  croppedImageUrl?: string;
  /** Processed image used for detection as data URL */
  processedImageUrl?: string;
  /** Strategy that successfully detected the QR code */
  strategy: string;
  /** Confidence score (0-1) if available */
  confidence?: number;
  /** Detected finder patterns (corner eyes) */
  finderPatterns?: FinderPattern[];
}

/**
 * Options for QR code detection
 */
export interface QRDetectionOptions {
  /** 
   * Kernel size for morphological operations (3-51, odd numbers)
   * Higher values help detect stylized QRs with dots
   * @default 9
   */
  kernelSize?: number;
  /**
   * Whether to use OpenCV for advanced detection
   * @default true (if available)
   */
  useOpenCV?: boolean;
  /**
   * Maximum image dimension for processing
   * Larger images will be scaled down
   * @default 1500
   */
  maxImageSize?: number;
  /**
   * Whether to detect multiple QR codes in the image
   * @default false
   */
  detectMultiple?: boolean;
  /**
   * Timeout for detection in milliseconds
   * @default 30000
   */
  timeout?: number;
  /**
   * Callback for progress updates
   */
  onProgress?: (progress: DetectionProgress) => void;
  /**
   * Whether to return detailed detection info (processed images, etc.)
   * @default false
   */
  returnDetailedInfo?: boolean;
}

/**
 * Progress information during detection
 */
export interface DetectionProgress {
  /** Current strategy being attempted */
  strategy: string;
  /** Progress percentage (0-100) */
  progress: number;
  /** Current step description */
  message: string;
  /** Strategies completed so far */
  completedStrategies: string[];
}

/**
 * OpenCV loading status
 */
export interface OpenCVStatus {
  /** Whether OpenCV is fully loaded and ready */
  ready: boolean;
  /** Whether OpenCV is currently loading */
  loading: boolean;
  /** Loading progress (0-100) */
  progress: number;
  /** Current loading status message */
  status: string;
  /** Error message if loading failed */
  error?: string;
}

/**
 * Message types for OpenCV worker communication
 */
export type OpenCVWorkerMessage =
  | { type: "init"; opencvUrl: string }
  | { type: "detect"; imageData: ImageData; options: QRDetectionOptions }
  | { type: "applyMorphology"; imageData: ImageData; kernelSize: number; shape: "ellipse" | "rect" }
  | { type: "applyAdaptiveThreshold"; imageData: ImageData; blockSize: number; c: number }
  | { type: "detectFinderPatterns"; imageData: ImageData }
  | { type: "abort" };

/**
 * Response types from OpenCV worker
 */
export type OpenCVWorkerResponse =
  | { type: "init-success" }
  | { type: "init-error"; error: string }
  | { type: "init-progress"; progress: number; status: string }
  | { type: "detect-success"; results: QRDetectionResult[] }
  | { type: "detect-error"; error: string }
  | { type: "detect-progress"; progress: DetectionProgress }
  | { type: "morphology-success"; imageData: ImageData }
  | { type: "morphology-error"; error: string }
  | { type: "threshold-success"; imageData: ImageData }
  | { type: "threshold-error"; error: string }
  | { type: "finder-patterns-success"; patterns: FinderPattern[] }
  | { type: "finder-patterns-error"; error: string };

// Zod schemas for validation
export const qrPositionSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});

export const qrLocationSchema = z.object({
  topLeftCorner: z.object({ x: z.number(), y: z.number() }),
  topRightCorner: z.object({ x: z.number(), y: z.number() }),
  bottomLeftCorner: z.object({ x: z.number(), y: z.number() }),
  bottomRightCorner: z.object({ x: z.number(), y: z.number() }),
});

export const qrDetectionResultSchema = z.object({
  data: z.string(),
  position: qrPositionSchema,
  location: qrLocationSchema.optional(),
  croppedImageUrl: z.string().optional(),
  processedImageUrl: z.string().optional(),
  strategy: z.string(),
  confidence: z.number().min(0).max(1).optional(),
});

export const qrDetectionOptionsSchema = z.object({
  kernelSize: z.number().min(3).max(51).optional(),
  useOpenCV: z.boolean().optional(),
  maxImageSize: z.number().positive().optional(),
  detectMultiple: z.boolean().optional(),
  timeout: z.number().positive().optional(),
  returnDetailedInfo: z.boolean().optional(),
}).strict();
