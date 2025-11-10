import type { TemplateDefinition } from "../types";
import * as templates from "./template";

// Re-export template types for convenience
export type { BaseTemplateProps, TemplateDefinition } from "../types";

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
};

// Utility functions
export const getTemplate = (
  templateId: string
): TemplateDefinition<any> | undefined => TEMPLATES[templateId];

export const getAllTemplates = (): TemplateDefinition<any>[] =>
  Object.values(TEMPLATES);

export const getTemplateIds = (): string[] => Object.keys(TEMPLATES);
