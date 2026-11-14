/** biome-ignore-all lint/performance/noBarrelFile: the zod half of qrdx/types */
// The zod schemas, and getFrameSpecIssues, which runs one. qrdx/core
// re-exports this module from a file of its own (dist/schemas.mjs), so a
// bundler leaves it, and zod, out of an app that never uses a schema. The
// engine itself validates frame specs with frame-spec-parse.ts instead.

export {
  qrArtImageSchema,
  qrArtModeSchema,
  qrArtSchema,
  qrArtVariantSchema,
} from "./art";
export {
  angularGradientSchema,
  colorConfigSchema,
  colorTypeSchema,
  gradientStopSchema,
  imageFitSchema,
  imagePaintSchema,
  imagePositionSchema,
  linearGradientSchema,
  radialGradientSchema,
  solidColorSchema,
} from "./color";
export { excavationSchema } from "./common";
export {
  cornerEyeDotPatternSchema,
  pickableCornerEyeDotPatternSchema,
} from "./corner-dot";
export {
  cornerEyePatternSchema,
  pickableCornerEyePatternSchema,
} from "./corner-eye";
export { frameSchema, frameStyleSchema } from "./frame";
export {
  anyFrameSchema,
  customFrameSchema,
  frameSpecColorSchema,
  frameSpecLabelSchema,
  frameSpecPaintSchema,
  frameSpecSchema,
  frameSpecShapeSchema,
  getFrameSpecIssues,
} from "./frame-spec";
export { bodyPatternSchema } from "./image-pattern";
export {
  errorLevelSchema,
  eyeColorOverrideSchema,
  eyeColorsSchema,
  imageSettingsSchema,
  logoOptionsSchema,
  logoShapeSchema,
  qrCodeShapeSchema,
  qrPropsSchema,
  qrShapeSchema,
  qrSilhouetteSchema,
} from "./qr";
export {
  baseTemplatePropsSchema,
  templateConfigSchema,
  templateDefinitionBaseSchema,
} from "./template";
