import { z } from "zod";
import {
  imageSchema,
  itemIdSchema,
  lineText,
  longText,
} from "@/components/landing/block-kit";

// Props of the menu block (shared by its Render and Editor).

export const DIET_TAGS = [
  "vegetarian",
  "vegan",
  "gluten-free",
  "dairy-free",
  "halal",
  "kosher",
  "spicy",
  "organic",
] as const;

export type DietTag = (typeof DIET_TAGS)[number];

export const DIET_LABELS: Record<DietTag, string> = {
  vegetarian: "Vegetarian",
  vegan: "Vegan",
  "gluten-free": "Gluten-free",
  "dairy-free": "Dairy-free",
  halal: "Halal",
  kosher: "Kosher",
  spicy: "Spicy",
  organic: "Organic",
};

/** The 14 allergens food businesses must declare in the EU and UK. */
export const ALLERGENS = [
  "gluten",
  "crustaceans",
  "eggs",
  "fish",
  "peanuts",
  "soy",
  "milk",
  "nuts",
  "celery",
  "mustard",
  "sesame",
  "sulphites",
  "lupin",
  "molluscs",
] as const;

export type Allergen = (typeof ALLERGENS)[number];

export const ALLERGEN_LABELS: Record<Allergen, string> = {
  gluten: "Gluten",
  crustaceans: "Crustaceans",
  eggs: "Eggs",
  fish: "Fish",
  peanuts: "Peanuts",
  soy: "Soy",
  milk: "Milk",
  nuts: "Tree nuts",
  celery: "Celery",
  mustard: "Mustard",
  sesame: "Sesame",
  sulphites: "Sulphites",
  lupin: "Lupin",
  molluscs: "Molluscs",
};

export const MAX_MENU_SECTIONS = 30;
export const MAX_MENU_ITEMS = 300;

const menuItemSchema = z.object({
  id: itemIdSchema,
  name: lineText(120).min(1, "Name every dish"),
  description: longText(500).default(""),
  /** null = no price shown (e.g. "Market price" in `priceNote`) */
  price: z.number().min(0).max(10_000_000).nullable().default(null),
  /** Shown after the price: "per glass", "Market price" */
  priceNote: lineText(40).default(""),
  image: imageSchema.optional(),
  diet: z.array(z.enum(DIET_TAGS)).max(DIET_TAGS.length).default([]),
  allergens: z.array(z.enum(ALLERGENS)).max(ALLERGENS.length).default([]),
  soldOut: z.boolean().default(false),
  /** Short badge: "New", "Chef's pick" */
  badge: lineText(30).default(""),
});

const menuSectionSchema = z.object({
  id: itemIdSchema,
  name: lineText(80).default(""),
  description: longText(300).default(""),
  items: z.array(menuItemSchema).max(MAX_MENU_ITEMS).default([]),
});

export const menuSchema = z
  .object({
    title: lineText(80).default(""),
    /** ISO 4217 code for every price on this menu */
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/, "Use a 3-letter currency code like USD")
      .default("USD"),
    /** Section shortcuts at the top (menus with 2+ sections) */
    showNav: z.boolean().default(true),
    sections: z.array(menuSectionSchema).max(MAX_MENU_SECTIONS).default([]),
    /** Allergen notice, service charge, ... */
    footnote: longText(500).default(""),
  })
  .refine(
    (menu) =>
      menu.sections.reduce(
        (total, section) => total + section.items.length,
        0,
      ) <= MAX_MENU_ITEMS,
    {
      message: `A menu can list up to ${MAX_MENU_ITEMS} items`,
      path: ["sections"],
    },
  );

export type MenuProps = z.output<typeof menuSchema>;
export type MenuSection = MenuProps["sections"][number];
export type MenuItem = MenuSection["items"][number];

/** "$12", "$12.50", "₹199"; falls back to "USD 12.50" for unknown codes. */
export function formatMenuPrice(price: number, currency: string): string {
  const whole = Number.isInteger(price);
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    }).format(price);
  } catch {
    return `${currency} ${whole ? price : price.toFixed(2)}`;
  }
}
