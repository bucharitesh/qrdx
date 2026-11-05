import { z } from "zod";
import {
  COMMUNITY_PAGE_DEFAULT,
  COMMUNITY_PAGE_MAX,
} from "@/lib/community/limits";

// Request schemas of /v1/community, here rather than in the route files so
// the OpenAPI generator (lib/openapi) documents exactly what they validate.

/** GET /v1/community/items query */
export const communityItemsQuerySchema = z.object({
  type: z
    .enum(["frame", "theme", "collection", "page-template", "kit"])
    .optional()
    .describe("Only items of this type; all types when left out"),
  q: z
    .string()
    .trim()
    .max(100)
    .optional()
    .describe(
      "Words that must all appear in the name, description, tags or creator",
    ),
  tag: z
    .string()
    .trim()
    .toLowerCase()
    .max(32)
    .optional()
    .describe("Only items with this tag, such as wifi or menu"),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(COMMUNITY_PAGE_MAX)
    .default(COMMUNITY_PAGE_DEFAULT)
    .describe(`Items per page (1–${COMMUNITY_PAGE_MAX})`),
  offset: z.coerce
    .number()
    .int()
    .min(0)
    .max(10_000)
    .default(0)
    .describe("Items to skip, for the next page"),
});

/** "frame:wifi-table-card": an item's type and slug. */
export const communityItemIdSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^(frame|theme|collection|page-template|kit):[a-z0-9][a-z0-9-]{0,95}$/,
    "Must be an item id such as frame:wifi-table-card",
  );
