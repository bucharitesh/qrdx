// Re-export color utilities from qrdx/types to avoid duplication and "use client" issues
// The types export path doesn't include "use client" directive, so it's safe for server contexts
export {
  getColorString,
  getSolidColor,
  isGradient,
  normalizeColorConfig,
} from "qrdx/types";
