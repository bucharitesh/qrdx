import { z } from "zod";
import type qrcodegen from "../src/codegen";

export type Modules = ReturnType<qrcodegen.QrCode["getModules"]>;

// Zod schemas
export const excavationSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});

// Inferred types
export type Excavation = z.infer<typeof excavationSchema>;
