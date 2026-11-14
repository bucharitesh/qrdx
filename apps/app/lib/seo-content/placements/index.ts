import type { SeoGroup } from "../types";
import { documents } from "./documents";
import { inStore } from "./in-store";
import { outdoor } from "./outdoor";
import { printMarketing } from "./print-marketing";
import { products } from "./products";
import { screens } from "./screens";

/** Hub order for /qr-codes-on. */
export const PLACEMENT_GROUPS: SeoGroup[] = [
  printMarketing,
  products,
  inStore,
  documents,
  outdoor,
  screens,
];
