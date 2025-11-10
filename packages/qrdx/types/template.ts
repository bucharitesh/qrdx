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
  pixelSize: number; // Calculated pixel size per QR module
  url: string; // The URL/value used to generate the QR code
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
