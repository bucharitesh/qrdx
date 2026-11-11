// The groups the official frames come in, in picker order. Kept free of the
// frame data so pickers can show the groups before loading any frame.
import type { OfficialFrameCollection } from "./official-types";

export const OFFICIAL_FRAME_COLLECTIONS: readonly {
  id: OfficialFrameCollection;
  label: string;
}[] = [
  { id: "call-to-action", label: "Call to action" },
  { id: "holidays", label: "Holidays" },
  { id: "seasons", label: "Seasons" },
  { id: "food-drink", label: "Food & drink" },
  { id: "shopping", label: "Shops & packaging" },
  { id: "events", label: "Events & weddings" },
  { id: "places", label: "Places & Wi-Fi" },
  { id: "health-learning", label: "Health & learning" },
  { id: "business", label: "Business & social" },
];
