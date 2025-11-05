import type { BodyPattern } from "./image-pattern";

// Base props that all templates support
export type BaseTemplateProps = {
  fgColor?: string;
  bgColor?: string;
};

/**
 * Configuration object passed to template wrappers containing all QR code metadata.
 * All dimension values are in the template coordinate space (typically 300x300).
 *
 * @example
 * ```tsx
 * wrapper: (children, config, props) => {
 *   // Use pixelSize to calculate decorative element sizes
 *   const decorativeRadius = config.pixelSize * 0.5;
 *
 *   // Use qrSize to determine QR complexity
 *   if (config.qrSize > 40) {
 *     // Adjust template for high-density QR codes
 *   }
 *
 *   return <svg>...</svg>;
 * }
 * ```
 */
export type TemplateConfig = {
  // Dimensions (all in template coordinate space)
  size: number; // Total size of the output
  templateSize: number; // Template coordinate system size (typically 300)
  margin: number; // Margin in modules
  pixelSize: number; // Calculated pixel size per QR module
  numCells: number; // Total number of cells including margin
  qrSize: number; // Number of QR code modules (without margin)

  // Visual patterns
  pattern?: BodyPattern; // Body pattern type (e.g., "circle", "square", "diamond")
  cornerEyePattern?: string; // Corner eye pattern type (e.g., "square", "rounded")
  cornerEyeDotPattern?: string; // Corner eye dot pattern type (e.g., "circle", "square")

  // Sizing helpers
  cornerSize: number; // Size of corner patterns (7 * pixelSize)
  cornerDotRadius: number; // Inner corner dot radius (1.5 * pixelSize)
};

// Generic template definition that allows custom props
export type TemplateDefinition<TCustomProps = Record<string, never>> = {
  id: string;
  name: string;
  description?: string;
  wrapper: (
    children: React.ReactNode,
    props?: BaseTemplateProps & TCustomProps,
    templateConfig?: TemplateConfig
  ) => React.ReactNode;
};
