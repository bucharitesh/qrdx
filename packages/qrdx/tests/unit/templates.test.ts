import { describe, it, expect } from "vitest";
import {
  getTemplate,
  getAllTemplates,
  getTemplateIds,
  TEMPLATES,
} from "../../src/templates";

describe("Templates", () => {
  describe("TEMPLATES registry", () => {
    it("should have template definitions", () => {
      expect(TEMPLATES).toBeDefined();
      expect(typeof TEMPLATES).toBe("object");
    });

    it("should have default template", () => {
      expect(TEMPLATES.default).toBeDefined();
      expect(TEMPLATES.default).toHaveProperty("wrapper");
    });

    it("should have FlamQR template", () => {
      expect(TEMPLATES.FlamQR).toBeDefined();
      expect(TEMPLATES.FlamQR).toHaveProperty("wrapper");
    });

    it("should have Arrow template", () => {
      expect(TEMPLATES.Arrow).toBeDefined();
      expect(TEMPLATES.Arrow).toHaveProperty("wrapper");
    });

    it("should have StandardBox template", () => {
      expect(TEMPLATES.StandardBox).toBeDefined();
      expect(TEMPLATES.StandardBox).toHaveProperty("wrapper");
    });

    it("should have SquareBorder template", () => {
      expect(TEMPLATES.SquareBorder).toBeDefined();
      expect(TEMPLATES.SquareBorder).toHaveProperty("wrapper");
    });

    it("should have StrikedBox template", () => {
      expect(TEMPLATES.StrikedBox).toBeDefined();
      expect(TEMPLATES.StrikedBox).toHaveProperty("wrapper");
    });

    it("should have Halloween template", () => {
      expect(TEMPLATES.Halloween).toBeDefined();
      expect(TEMPLATES.Halloween).toHaveProperty("wrapper");
    });
  });

  describe("getTemplate", () => {
    it("should return template by ID", () => {
      const template = getTemplate("default");
      expect(template).toBeDefined();
      expect(template).toBe(TEMPLATES.default);
    });

    it("should return undefined for non-existent template", () => {
      const template = getTemplate("nonexistent");
      expect(template).toBeUndefined();
    });

    it("should return correct template for each ID", () => {
      const templateIds = ["default", "FlamQR", "Arrow", "StandardBox", "SquareBorder", "StrikedBox", "Halloween"];

      templateIds.forEach((id) => {
        const template = getTemplate(id);
        expect(template).toBeDefined();
        expect(template).toBe(TEMPLATES[id]);
      });
    });
  });

  describe("getAllTemplates", () => {
    it("should return array of all templates", () => {
      const templates = getAllTemplates();
      expect(Array.isArray(templates)).toBe(true);
      expect(templates.length).toBeGreaterThan(0);
    });

    it("should return templates with wrapper functions", () => {
      const templates = getAllTemplates();
      templates.forEach((template) => {
        expect(template).toHaveProperty("wrapper");
        expect(typeof template.wrapper).toBe("function");
      });
    });

    it("should include all known templates", () => {
      const templates = getAllTemplates();
      const expectedCount = Object.keys(TEMPLATES).length;
      expect(templates.length).toBe(expectedCount);
    });
  });

  describe("getTemplateIds", () => {
    it("should return array of template IDs", () => {
      const ids = getTemplateIds();
      expect(Array.isArray(ids)).toBe(true);
      expect(ids.length).toBeGreaterThan(0);
    });

    it("should include all template names", () => {
      const ids = getTemplateIds();
      expect(ids).toContain("default");
      expect(ids).toContain("FlamQR");
      expect(ids).toContain("Arrow");
      expect(ids).toContain("StandardBox");
      expect(ids).toContain("SquareBorder");
      expect(ids).toContain("StrikedBox");
      expect(ids).toContain("Halloween");
    });

    it("should match keys in TEMPLATES", () => {
      const ids = getTemplateIds();
      const expectedIds = Object.keys(TEMPLATES);
      expect(ids.sort()).toEqual(expectedIds.sort());
    });
  });

  describe("Template wrapper functions", () => {
    it("should have callable wrapper functions", () => {
      const templates = getAllTemplates();

      templates.forEach((template) => {
        expect(template.wrapper).toBeDefined();
        expect(typeof template.wrapper).toBe("function");
      });
    });

    it("should return JSX elements from wrappers", () => {
      const template = getTemplate("default");
      expect(template).toBeDefined();
      expect(template).toHaveProperty("wrapper");
      expect(typeof template?.wrapper).toBe("function");
    });
  });
});

