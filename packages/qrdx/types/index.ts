// Re-export all types from domain files

// Re-export utility functions that don't require React
// These can be used in server contexts without "use client" directive
export { getSolidColor } from "../src/utils/color";

// Detection types
export type {
  QRDetectionResult,
  QRDetectionOptions,
  QRPosition,
  QRLocation,
  FinderPattern,
  DetectionProgress,
  OpenCVStatus,
  OpenCVWorkerMessage,
  OpenCVWorkerResponse,
} from "./detection";
export {
  qrPositionSchema,
  qrLocationSchema,
  qrDetectionResultSchema,
  qrDetectionOptionsSchema,
} from "./detection";
export type {
  ColorConfig,
  ColorType,
  GradientStop,
  LinearGradient,
  RadialGradient,
  SolidColor,
} from "./color";
export {
  colorConfigSchema,
  colorTypeSchema,
  getColorString,
  gradientStopSchema,
  isGradient,
  linearGradientSchema,
  normalizeColorConfig,
  radialGradientSchema,
  solidColorSchema,
} from "./color";
export type { Excavation, Modules } from "./common";
export { excavationSchema } from "./common";
export type { CornerEyeDotPattern } from "./corner-dot";
export {
  CORNER_EYE_DOT_PATTERNS,
  cornerEyeDotPatternSchema,
} from "./corner-dot";
export type { CornerEyePattern } from "./corner-eye";
export { CORNER_EYE_PATTERNS, cornerEyePatternSchema } from "./corner-eye";
export type { BodyPattern } from "./image-pattern";
export { BODY_PATTERN, bodyPatternSchema } from "./image-pattern";
export type {
  ErrorLevel,
  ImageSettings,
  QRProps,
  QRPropsCanvas,
  QRPropsSVG,
} from "./qr";
export {
  errorLevelSchema,
  imageSettingsSchema,
  qrPropsSchema,
} from "./qr";
export type {
  BaseTemplateProps,
  TemplateConfig,
  TemplateDefinition,
} from "./template";
export {
  baseTemplatePropsSchema,
  templateConfigSchema,
  templateDefinitionBaseSchema,
} from "./template";
