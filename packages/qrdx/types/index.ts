// Re-export all types from domain files

export { DEFAULT_MARGIN } from "../src/constants";
// Re-export utility functions that don't require React
// These can be used in server contexts without "use client" directive
export { getSolidColor } from "../src/utils/color";
export type { QRArt, QRArtImage, QRArtMode, QRArtVariant } from "./art";
export {
  QR_ART_MAX_SAMPLE_SIZE,
  QR_ART_MODES,
  QR_ART_VARIANTS,
  qrArtImageSchema,
  qrArtModeSchema,
  qrArtSchema,
  qrArtVariantSchema,
} from "./art";
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
  getNormalizedColor,
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
export type { FrameStyle, QRFrame } from "./frame";
export {
  DEFAULT_FRAME_TEXT,
  FRAME_FONT_SCALE_MAX,
  FRAME_FONT_SCALE_MIN,
  FRAME_STYLES,
  FRAME_TEXT_MAX_LENGTH,
  frameSchema,
  frameStyleSchema,
} from "./frame";
export type { BodyPattern } from "./image-pattern";
export { BODY_PATTERN, bodyPatternSchema } from "./image-pattern";
export type {
  ErrorLevel,
  EyeColorOverride,
  EyeColors,
  EyePosition,
  ImageSettings,
  QRProps,
  QRPropsCanvas,
  QRPropsSVG,
} from "./qr";
export {
  AUTO_LEVEL_LOGO_COVERAGE,
  EYE_POSITIONS,
  errorLevelSchema,
  eyeColorOverrideSchema,
  eyeColorsSchema,
  imageSettingsSchema,
  MODULE_SCALE_MAX,
  MODULE_SCALE_MIN,
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
