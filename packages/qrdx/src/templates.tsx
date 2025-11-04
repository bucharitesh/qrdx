import type { TemplateDefinition } from "../types";
import {
  Arrow,
  defaultTemplate,
  FlamQR,
  Halloween,
  SquareBorder,
  StandardBox,
  StrikedBox,
} from "./template";

// Template registry - using TemplateDefinition<any> to allow different custom props
export const TEMPLATES: Record<string, TemplateDefinition<any>> = {
  default: defaultTemplate,
  FlamQR,
  Arrow,
  StandardBox,
  SquareBorder,
  StrikedBox,
  Halloween,
};

// Utility functions
export const getTemplate = (
  templateId: string
): TemplateDefinition<any> | undefined => TEMPLATES[templateId];

export const getAllTemplates = (): TemplateDefinition<any>[] =>
  Object.values(TEMPLATES);

export const getTemplateIds = (): string[] => Object.keys(TEMPLATES);
