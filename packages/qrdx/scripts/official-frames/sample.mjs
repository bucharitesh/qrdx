/** biome-ignore-all lint/suspicious/noBitwiseOperators: FNV-1a */
// Which official frames get the expensive scan checks in a test run.
//
// Every frame gets the cheap checks on every run (its spec, colors, layout,
// one crisp decode, and the generator's own checks). The scan model (phone
// distances through a camera model, 160 and 320 px, the scan score, zbar)
// and the PDF/EPS comparison cost about 1.5 s a frame, so a normal run
// gives them to:
//   - the hand-made frames, in full (as before the library grew);
//   - a fixed set with one frame per generator layout (and so every
//     collection), on the link payload;
//   - a rotating sample, in full: the frames whose id hash lands on today's
//     slot, so each frame comes round once every ROTATION_DAYS days.
// QRDX_FULL_FRAME_SCAN=1 runs everything on every frame (the Frame scan
// workflow, .github/workflows/frame-scan.yml, does on each release and
// weekly). QRDX_FRAME_SCAN_DAY=<n> replays the sample of day n (UTC days
// since 1970), as a failing run printed it. QRDX_FRAME_SCAN_PART=<i>/<n>
// checks part i of n of the frames, so the workflow's parallel jobs split
// them and together check every one.
import { ENTRIES } from "./catalogue.mjs";
import { HAND_MADE } from "./modules.mjs";

/** Days for the rotating sample to come round to every generated frame. */
export const ROTATION_DAYS = 42;

const fnv = (text) => {
  let hash = 0x81_1c_9d_c5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01_00_01_93) >>> 0;
  }
  return hash;
};

/** True when every frame should get every check. */
export const fullFrameScan = () => process.env.QRDX_FULL_FRAME_SCAN === "1";

/** The UTC day the rotating sample is drawn for. */
export function frameScanDay(now = Date.now()) {
  const fixed = Number.parseInt(process.env.QRDX_FRAME_SCAN_DAY ?? "", 10);
  return Number.isFinite(fixed) ? fixed : Math.floor(now / 86_400_000);
}

/** One generated frame per layout, the first of each in catalogue order. */
export function layoutSample() {
  const seen = new Set();
  const ids = [];
  for (const entry of ENTRIES) {
    if (seen.has(entry.layout)) continue;
    seen.add(entry.layout);
    ids.push(entry.id);
  }
  // Every collection, too (each already has a layout of its own today)
  const collections = new Set(
    ENTRIES.filter((entry) => ids.includes(entry.id)).map((e) => e.collection)
  );
  for (const entry of ENTRIES) {
    if (collections.has(entry.collection)) continue;
    collections.add(entry.collection);
    ids.push(entry.id);
  }
  return ids;
}

/** The generated frames whose turn it is on `day`. */
export function rotatingSample(day = frameScanDay()) {
  return ENTRIES.filter(
    (entry) => (fnv(entry.id) + day) % ROTATION_DAYS === 0
  ).map((entry) => entry.id);
}

/**
 * The frames for the expensive checks: `full` (every check) and `light`
 * (the link payload's scan checks only).
 */
export function frameScanPlan(allIds, day = frameScanDay()) {
  if (fullFrameScan()) return { full: [...allIds], light: [], day };
  const full = [...new Set([...HAND_MADE, ...rotatingSample(day)])];
  const light = layoutSample().filter((id) => !full.includes(id));
  return { full, light, day };
}

/** Shard `index` (1-based) of `count` of `ids`. */
export const shardOf = (ids, index, count) =>
  ids.filter((_, i) => i % count === index - 1);

/**
 * The part of `items` this run checks: shard i of n with
 * QRDX_FRAME_SCAN_PART=<i>/<n>, all of them when it's unset.
 */
export function framePart(items) {
  const part = process.env.QRDX_FRAME_SCAN_PART ?? "";
  if (part === "") return items;
  const match = /^(\d+)\/(\d+)$/.exec(part);
  const index = Number(match?.[1]);
  const count = Number(match?.[2]);
  if (!(match && index >= 1 && index <= count)) {
    throw new Error(`QRDX_FRAME_SCAN_PART must be <i>/<n>, not "${part}"`);
  }
  return shardOf(items, index, count);
}

/** " (part i of n)" when the run checks a part, else "". */
export function framePartLabel() {
  const part = process.env.QRDX_FRAME_SCAN_PART ?? "";
  return part === "" ? "" : ` (part ${part.replace("/", " of ")})`;
}
