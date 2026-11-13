// QRdx's official frames: call-to-action styles, holidays and seasons from
// around the world, and frames for restaurants, shops, beauty, events,
// places, real estate, cars, health and learning, sports, business and
// nonprofits. Each is a frame spec with editable labels and theme colors
// (CC0 1.0), checked to decode at phone distances and to score Great (tests/official-frames/). Apply one with
// `frame: { style: "custom", spec: frame.spec }`.
//
// The frames live in ./official/<id>.json; ./catalogue/ is generated from
// them (scripts/official-frames/write.mjs): the full list, one module per
// collection (load a group at a time) and a light index without specs.
// The package builds this module on its own (dist/frames-official), so an
// app that never uses the frames doesn't ship them (tsup.config.ts).
import { OFFICIAL_FRAME_LIST } from "./catalogue/all";

export {
  OFFICIAL_FRAME_COUNT,
  OFFICIAL_FRAME_COUNTS,
} from "./catalogue/counts";
export { OFFICIAL_FRAME_COLLECTIONS } from "./collections";
export type {
  OfficialFrame,
  OfficialFrameCollection,
  OfficialFrameIndexEntry,
} from "./official-types";
export { frameSpecHash } from "./spec-hash";

/** Every official frame, in catalogue order. */
export const OFFICIAL_FRAMES = OFFICIAL_FRAME_LIST;

/** An official frame by id. */
export function getOfficialFrame(id: string) {
  return OFFICIAL_FRAMES.find((frame) => frame.id === id);
}
