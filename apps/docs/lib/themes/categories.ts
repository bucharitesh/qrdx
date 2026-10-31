import type { ThemeCategory } from "@/types/theme";

/** Gallery shelves, in display order. */
export const CATEGORY_ORDER: readonly ThemeCategory[] = [
  "essentials",
  "brand",
  "pastel",
  "bold",
  "gradient",
  "elegant",
  "playful",
  "dark",
  "industry",
  "seasonal",
];

export const CATEGORY_LABELS: Record<ThemeCategory, string> = {
  essentials: "Essentials",
  brand: "Brand colours",
  pastel: "Soft & pastel",
  bold: "Bold & vibrant",
  gradient: "Gradient",
  elegant: "Elegant",
  playful: "Playful",
  dark: "Dark",
  industry: "Industry starters",
  seasonal: "Seasonal",
};

/** Light-on-dark codes: some older scanner apps can't read them. */
export const DARK_THEME_NOTE = "May not scan on older phones";
