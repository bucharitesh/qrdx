// Re-export all types from domain files

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
