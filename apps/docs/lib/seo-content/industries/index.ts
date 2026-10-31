import type { SeoGroup } from "../types";
import { community } from "./community";
import { foodDrink } from "./food-drink";
import { hospitalityTravel } from "./hospitality-travel";
import { industrial } from "./industrial";
import { professional } from "./professional";
import { retailConsumer } from "./retail-consumer";

/** Hub order for /qr-codes-for. */
export const INDUSTRY_GROUPS: SeoGroup[] = [
  foodDrink,
  retailConsumer,
  hospitalityTravel,
  community,
  industrial,
  professional,
];
