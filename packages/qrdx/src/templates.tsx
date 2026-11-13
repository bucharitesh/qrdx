import type { TemplateDefinition } from "../types";
import * as templates from "./template";

// Re-export template types for convenience
export type {
  BaseTemplateProps,
  TemplateConfig,
  TemplateDefinition,
} from "../types";

// Re-export individual templates for direct import
export * from "./template";

// Template registry - using TemplateDefinition<any> to allow different custom props
export const TEMPLATES: Record<string, TemplateDefinition<any>> = {
  default: templates.defaultTemplate,
  Arrow: templates.Arrow,
  StandardBox: templates.StandardBox,
  SquareBorder: templates.SquareBorder,
  StrikedBox: templates.StrikedBox,
  Halloween: templates.Halloween,
  DotRing: templates.DotRing,
};

// Earlier ids that still draw their template, so designs saved with them keep
// working. getTemplateIds and getAllTemplates leave them out.
const TEMPLATE_ALIASES: Record<string, string> = {
  FlamQR: "DotRing",
};

// Utility functions
export const getTemplate = (
  templateId: string
): TemplateDefinition<any> | undefined => {
  if (Object.hasOwn(TEMPLATES, templateId)) {
    return TEMPLATES[templateId];
  }
  const alias = Object.hasOwn(TEMPLATE_ALIASES, templateId)
    ? TEMPLATE_ALIASES[templateId]
    : undefined;
  return alias ? TEMPLATES[alias] : undefined;
};

export const getAllTemplates = (): TemplateDefinition<any>[] =>
  Object.values(TEMPLATES);

export const getTemplateIds = (): string[] => Object.keys(TEMPLATES);
