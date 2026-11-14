/** biome-ignore-all lint/performance/noBarrelFile: the zod-free half of qrdx/types */
// Everything in qrdx/types except the zod schemas: option lists, limits,
// helpers and types. The engine (qrdx/core, the React entry and every
// adapter) draws with these and nothing else, so rendering a code never
// loads zod. The schemas are in ./schemas, which the engine re-exports from
// a file of its own (dist/schemas.mjs) that bundlers leave out unless an app
// uses a schema.

export { DEFAULT_MARGIN } from "../src/constants";
// Utility functions that don't require React (usable in server contexts
// without a "use client" directive)
export { getSolidColor } from "../src/utils/color";
export type { QRArt, QRArtImage, QRArtMode, QRArtVariant } from "./art";
export type {
  AngularGradient,
  ColorConfig,
  ColorType,
  Gradient,
  GradientStop,
  ImageFit,
  ImagePaint,
  ImagePosition,
  LinearGradient,
  RadialGradient,
  SolidColor,
} from "./color";
export {
  getColorString,
  getNormalizedColor,
  imagePositionCss,
  isGradient,
  isImagePaint,
  normalizeColorConfig,
} from "./color-helpers";
export type { Excavation, Modules } from "./common";
export {
  AUTO_LEVEL_LOGO_COVERAGE,
  BODY_PATTERN,
  CORNER_EYE_DOT_PATTERNS,
  CORNER_EYE_PATTERNS,
  DEFAULT_FRAME_TEXT,
  EYE_POSITIONS,
  FRAME_FONT_SCALE_MAX,
  FRAME_FONT_SCALE_MIN,
  FRAME_STYLES,
  FRAME_TEXT_MAX_LENGTH,
  LOGO_PADDING_MAX,
  LOGO_SHAPES,
  LOGO_SIZE_DEFAULT,
  LOGO_SIZE_MAX,
  LOGO_SIZE_MIN,
  MODULE_SCALE_MAX,
  MODULE_SCALE_MIN,
  QR_ART_MAX_SAMPLE_SIZE,
  QR_ART_MODES,
  QR_ART_VARIANTS,
  QR_CIRCLE_QUIET_MIN,
  QR_SHAPES,
  QR_SILHOUETTE_MAX_CELLS,
  QR_SILHOUETTE_MIN_CELLS,
  QR_SILHOUETTE_MIN_SHARE,
  RETIRED_CORNER_EYE_DOT_PATTERNS,
  RETIRED_CORNER_EYE_PATTERNS,
} from "./constants";
export type {
  CornerEyeDotPattern,
  PickableCornerEyeDotPattern,
} from "./corner-dot";
export type { CornerEyePattern, PickableCornerEyePattern } from "./corner-eye";
export type { FrameStyle, QRFrame } from "./frame";
export type {
  AnyQRFrame,
  FrameSpec,
  FrameSpecColor,
  FrameSpecIcon,
  FrameSpecLabel,
  FrameSpecPaint,
  FrameSpecShape,
  QRCustomFrame,
} from "./frame-spec";
export {
  CUSTOM_FRAME_STYLE,
  FRAME_COLOR_TOKENS,
  FRAME_ICON_MAX_SEGMENTS,
  FRAME_ICONS,
  FRAME_SPEC_KIND,
  FRAME_SPEC_LABEL_MAX_FONT,
  FRAME_SPEC_LIMITS,
  FRAME_SPEC_VERSION,
  frameSpecPadding,
  frameSpecQrZone,
  isLatin1Text,
  sanitizeFrameText,
} from "./frame-spec-rules";
export type { BodyPattern } from "./image-pattern";
export type {
  ErrorLevel,
  EyeColorOverride,
  EyeColors,
  EyePosition,
  ImageSettings,
  LogoOptions,
  LogoShape,
  QRCodeShape,
  QRProps,
  QRShape,
  QRSilhouette,
  QRStyle,
  QRSVGAttributes,
  QRSVGOptions,
} from "./qr";
export type {
  BaseTemplateProps,
  TemplateConfig,
  TemplateDefinition,
  TemplateNode,
} from "./template";
