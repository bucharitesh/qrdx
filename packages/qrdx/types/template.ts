import { z } from "zod";

// Zod schemas
export const baseTemplatePropsSchema = z.object({
  fgColor: z.string().optional(),
  bgColor: z.string().optional(),
});

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
export const templateConfigSchema = z.object({
  pixelSize: z.number(),
  url: z.string(),
});

// Note: TemplateDefinition cannot be fully represented in Zod due to its element and function types
// We'll keep the type definition but add validation for the serializable parts
export const templateDefinitionBaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
});

// Inferred types
export type BaseTemplateProps = z.infer<typeof baseTemplatePropsSchema>;
export type TemplateConfig = z.infer<typeof templateConfigSchema>;

/**
 * What a template wrapper receives and returns: React elements when a React
 * component draws the code, the core's plain nodes (`QRNode`) otherwise. A
 * wrapper written with JSX or `h` from "qrdx/core" works in both.
 */
export type TemplateNode = any;

// Generic template definition that allows custom props
export interface TemplateDefinition<TCustomProps = Record<string, never>> {
  id: string;
  name: string;
  description?: string;
  wrapper: (
    children: TemplateNode,
    props?: BaseTemplateProps & TCustomProps,
    templateConfig?: TemplateConfig
  ) => TemplateNode;
}
