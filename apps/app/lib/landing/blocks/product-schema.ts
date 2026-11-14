import { z } from "zod";
import {
  itemIdSchema,
  lineText,
  longText,
} from "@/components/landing/block-kit";
import { compactGtin, gtinProblem } from "@/lib/gs1/digital-link";
import { ALLERGENS } from "./menu-schema";

// Props of the product block (shared by its Render and Editor): what a
// pack can't fit. Ingredients, allergens, nutrition, certifications and
// sections for care, materials, origin or recycling (a product passport),
// plus the GTIN that GS1 Digital Link resolves on a custom domain.

export const MAX_CERTIFICATIONS = 20;
export const MAX_NUTRITION_ROWS = 40;
export const MAX_PRODUCT_SECTIONS = 12;

/** Empty, or a GTIN-8/12/13/14 with a correct check digit (spaces dropped). */
export const gtinSchema = z
  .string()
  .trim()
  .max(32)
  .default("")
  .transform(compactGtin)
  .superRefine((value, ctx) => {
    const problem = value ? gtinProblem(value) : null;
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  });

const certificationSchema = z.object({
  id: itemIdSchema,
  label: lineText(60).min(1, "Name every certification"),
});

const nutritionRowSchema = z.object({
  id: itemIdSchema,
  name: lineText(60).min(1, "Name every nutrient"),
  value: lineText(60).default(""),
  /** Indented under the row above ("of which sugars") */
  sub: z.boolean().default(false),
});

const productSectionSchema = z.object({
  id: itemIdSchema,
  title: lineText(80).min(1, "Give every section a title"),
  body: longText(3000).default(""),
});

export const productSchema = z.object({
  title: lineText(120).default(""),
  gtin: gtinSchema,
  /** Print the GTIN under the details */
  showGtin: z.boolean().default(true),
  certifications: z
    .array(certificationSchema)
    .max(MAX_CERTIFICATIONS)
    .default([]),
  ingredients: longText(3000).default(""),
  allergens: z.array(z.enum(ALLERGENS)).max(ALLERGENS.length).default([]),
  /** "May contain traces of nuts" */
  allergenNote: lineText(200).default(""),
  nutrition: z
    .object({
      /** "Per 100 g", "Per serving (30 g)" */
      basis: lineText(60).default(""),
      rows: z.array(nutritionRowSchema).max(MAX_NUTRITION_ROWS).default([]),
    })
    .prefault({}),
  /** Sections that open on tap: care, materials, recycling, warnings... */
  sections: z.array(productSectionSchema).max(MAX_PRODUCT_SECTIONS).default([]),
});

export type ProductProps = z.output<typeof productSchema>;
export type ProductCertification = ProductProps["certifications"][number];
export type NutritionRow = ProductProps["nutrition"]["rows"][number];
export type ProductSection = ProductProps["sections"][number];

/** Certifications offered as one-tap suggestions in the editor. */
export const CERTIFICATION_SUGGESTIONS = [
  "Organic",
  "Fairtrade",
  "Vegan",
  "Vegetarian",
  "Gluten-free",
  "Non-GMO",
  "Halal",
  "Kosher",
  "Cruelty-free",
  "Recyclable packaging",
] as const;

/** "0950 6000 1343 52": the GTIN in groups that are easy to read. */
export function formatGtin(gtin: string): string {
  return gtin.replace(/(\d{4})(?=\d)/g, "$1 ");
}
