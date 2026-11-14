import { z } from "zod";
import { BODY_PATTERN } from "./constants";

export { BODY_PATTERN } from "./constants";

// Zod schema
export const bodyPatternSchema = z.enum(BODY_PATTERN);

// Inferred type
export type BodyPattern = z.infer<typeof bodyPatternSchema>;
