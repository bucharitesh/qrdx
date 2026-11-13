/** biome-ignore-all lint/performance/noBarrelFile: the engine's barrel */
// The React-free engine: everything in qrdx/core except the official frame
// library's data (core.ts adds it). The no-bundler browser build of
// qrdx/vanilla starts here, so a page doesn't download the whole library.

export * from "../types";
export {
  createQRArtImage,
  DEFAULT_ART_INTENSITY,
  getQRArtColorIssue,
  getQRArtEyeColors,
  getQRArtVariant,
  getQRFunctionModules,
  isQRArtActive,
  loadQRArtImage,
  QR_ART_MIN_LUMA_GAP,
  QR_ART_SAMPLE_SIZES,
  type QRArtColorIssue,
  type QRArtEyeColorOptions,
  type QRArtPixels,
  type QRArtRenderOptions,
  renderQRArt,
} from "./art";
export { clampModuleScale, MODULE_SCALE_FLOOR } from "./body-patterns";
export {
  type CodewordMap,
  damagedCodewords,
  getCodewordMap,
} from "./codeword-map";
/** Width and height of a code when `size` isn't given (128 px). */
export { DEFAULT_SIZE } from "./constants";
export * from "./detection";
export * from "./download";
export {
  downloadPrintEPS,
  EPS_IMAGE_FILL_REASON,
  type EPSOptions,
  epsToDataUrl,
  getQRAsEPS,
  hasImageFill,
  type SVGToEPSOptions,
  svgToEPS,
} from "./eps";
export { getQRAsCanvas, getQRAsSVGDataUri } from "./export";
export {
  FRAME_FONT_FAMILY,
  FRAME_GAP_RATIO,
  FRAME_LABEL_ATTRIBUTE,
  type FrameBox,
  type FrameLabel,
  type FrameLayout,
  type FramePath,
  type FramePolygon,
  type FrameRect,
  type FrameShape,
  frameLabels,
  getFrameDimensions,
  getFrameGapRatio,
  getFrameLayout,
  getFrameSecondaryText,
  getFrameText,
  isFrameActive,
} from "./frame";
export {
  FRAME_ICON_BOX,
  type FrameIconPath,
  getFrameIconPath,
} from "./frame-icons";
export {
  FRAME_IMPORT_LIMITS,
  type FrameImportColor,
  type FrameImportOptions,
  type FrameImportResult,
  type FrameImportWarning,
  importFrameSvg,
} from "./frame-import";
export {
  FrameSpecError,
  type FrameSpecOptions,
  getCustomFrameLayout,
  getFrameSpecColors,
  getFrameSpecGapRatio,
  resolveFrameSpec,
} from "./frame-spec";
export { mixFrameColors } from "./frame-text";
export {
  BUILT_IN_FRAME_SPECS,
  BUILT_IN_FRAMES,
  type BuiltInFrame,
  type BuiltInFrameStyle,
  frameSpecOf,
  GRADIENT_FRAME_DEFAULTS,
  getBuiltInFrame,
  getFrameColors,
} from "./frames/builtin";
export {
  OFFICIAL_FRAME_COUNT,
  OFFICIAL_FRAME_COUNTS,
} from "./frames/catalogue/counts";
export { OFFICIAL_FRAME_COLLECTIONS } from "./frames/collections";
export type {
  OfficialFrame,
  OfficialFrameCollection,
  OfficialFrameIndexEntry,
} from "./frames/official-types";
export { frameSpecHash } from "./frames/spec-hash";
export { getLogoSizeLimit, getQRData } from "./helpers";
export {
  Fragment,
  h,
  isQRNode,
  type QRChild,
  type QRComponent,
  type QRNode,
  type QRNodeProps,
} from "./jsx/runtime";
export {
  LOGO_PLATE_INSET,
  LOGO_ROUNDED_RADIUS,
} from "./logo";
export {
  getLogoBlockDamage,
  LOGO_EC_SAFETY,
  type LogoBlockDamage,
  logoFitsBudget,
} from "./logo-budget";
export {
  LOGO_CLEANUP_MAX_SIDE,
  type LogoPixels,
  removeLogoBackdrop,
  removeLogoBackground,
} from "./logo-cleanup";
export {
  partMarker,
  QR_EYE_ATTRIBUTE,
  QR_PART_ATTRIBUTE,
  QR_PARTS,
  type QRPart,
  type QRPartEye,
} from "./part-markers";
export { getQRAsSVGNode } from "./plain";
export * from "./print";
export {
  getQRCodeData,
  getQRCodeSVGProps,
  type QRCodeProps,
  resolveQRCodeProps,
} from "./qr-code-props";
export {
  circleQuietZone,
  getLayoutMargin,
  getQRShapePath,
  getQRSilhouetteFit,
  isShapedCode,
  type QRSilhouetteFit,
} from "./qr-shape";
export { renderToDOM } from "./render/dom";
export { type CreateElement, toHyperscript } from "./render/hyperscript";
export { renderToString } from "./render/string";
export {
  getStylePairRisk,
  isWeakSharpPair,
  SHARP_DOT_EYE_SAFE_BODIES,
  type StylePairRisk,
  WEAK_BODY_EYES,
  WEAK_DOT_EYES,
  WEAK_DOTS,
  WEAK_EYES,
  WEAK_SHARP_DOT_EYES,
} from "./scan-risk";
export * from "./scan-score";
export {
  createQRSilhouette,
  loadQRSilhouette,
} from "./silhouette";
export { toSVGElement, toSVGString } from "./svg";
export * from "./templates";
export * from "./utils";
/** Reads an 8-bit PNG into RGBA pixels (no DOM or sharp), or null. */
export { type DecodedImage, decodePng as decodePNGPixels } from "./utils/png";
export * from "./webp";
