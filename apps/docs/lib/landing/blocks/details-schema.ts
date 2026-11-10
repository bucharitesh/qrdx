import { z } from "zod";
import { itemIdSchema, lineText } from "@/components/landing/block-kit";

// Label and value pairs: a home's beds and baths, a pet's breed and
// microchip, a product's origin and weight, blood type on a medical ID.

export const MAX_DETAILS = 40;

export const detailItemSchema = z.object({
  id: itemIdSchema,
  label: lineText(60).min(1, "Name every detail"),
  value: lineText(200).default(""),
});

export const detailsSchema = z.object({
  title: lineText(120).default(""),
  items: z.array(detailItemSchema).max(MAX_DETAILS).default([]),
  /** rows: label left, value right; tiles: a grid of big values */
  layout: z.enum(["rows", "tiles"]).default("rows"),
});

export type DetailsProps = z.output<typeof detailsSchema>;
export type DetailItem = DetailsProps["items"][number];
