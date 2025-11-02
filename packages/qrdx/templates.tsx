import type React from "react";
import {
  Arrow,
  defaultTemplate,
  FlamQR,
  Halloween,
  SquareBorder,
  StandardBox,
  StrikedBox,
} from "./template";

export type TemplateDefinition = {
  id: string;
  name: string;
  description?: string;
  wrapper: (
    children: React.ReactNode,
    props?: { fgColor?: string; bgColor?: string; customText?: string }
  ) => React.ReactNode;
};

// Template registry
export const TEMPLATES: Record<string, TemplateDefinition> = {
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
): TemplateDefinition | undefined => TEMPLATES[templateId];

export const getAllTemplates = (): TemplateDefinition[] =>
  Object.values(TEMPLATES);

export const getTemplateIds = (): string[] => Object.keys(TEMPLATES);
