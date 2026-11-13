// QRdx's official frame library, loaded on demand. The playground's first
// load carries none of it: the index (names, collections, tags and a hash
// per frame, no specs) and each collection's specs are separate chunks,
// loaded when the frame picker or a link needs them. What has loaded stays
// in a registry, read synchronously by the editor (names, the picker's
// value, playground links) and watched by React through useFrameLibrary()
// (./use-frame-library.ts; this module stays free of React for the server).
//
// Server code reads the full catalogue instead (lib/community/catalog.ts).

import {
  type FrameSpec,
  frameSpecHash,
  type OfficialFrame,
  type OfficialFrameCollection,
  type OfficialFrameIndexEntry,
} from "qrdx";

type CollectionModule = { default: readonly OfficialFrame[] };

// One chunk per collection: literal paths, so the bundler can split them.
const COLLECTION_LOADERS: Record<
  OfficialFrameCollection,
  () => Promise<CollectionModule>
> = {
  "call-to-action": () =>
    import("../../../../packages/qrdx/src/frames/catalogue/call-to-action"),
  holidays: () =>
    import("../../../../packages/qrdx/src/frames/catalogue/holidays"),
  seasons: () =>
    import("../../../../packages/qrdx/src/frames/catalogue/seasons"),
  "food-drink": () =>
    import("../../../../packages/qrdx/src/frames/catalogue/food-drink"),
  shopping: () =>
    import("../../../../packages/qrdx/src/frames/catalogue/shopping"),
  "beauty-wellness": () =>
    import("../../../../packages/qrdx/src/frames/catalogue/beauty-wellness"),
  events: () => import("../../../../packages/qrdx/src/frames/catalogue/events"),
  places: () => import("../../../../packages/qrdx/src/frames/catalogue/places"),
  "real-estate": () =>
    import("../../../../packages/qrdx/src/frames/catalogue/real-estate"),
  automotive: () =>
    import("../../../../packages/qrdx/src/frames/catalogue/automotive"),
  "health-learning": () =>
    import("../../../../packages/qrdx/src/frames/catalogue/health-learning"),
  "sports-fitness": () =>
    import("../../../../packages/qrdx/src/frames/catalogue/sports-fitness"),
  business: () =>
    import("../../../../packages/qrdx/src/frames/catalogue/business"),
  nonprofit: () =>
    import("../../../../packages/qrdx/src/frames/catalogue/nonprofit"),
};

const loadIndexModule = () =>
  import("../../../../packages/qrdx/src/frames/catalogue/index");

// ── Registry ────────────────────────────────────────────────────────────────

let index: readonly OfficialFrameIndexEntry[] | null = null;
let indexById = new Map<string, OfficialFrameIndexEntry>();
let indexByHash = new Map<string, OfficialFrameIndexEntry>();
let indexPromise: Promise<readonly OfficialFrameIndexEntry[]> | null = null;
const frames = new Map<string, OfficialFrame>();
const collections = new Map<
  OfficialFrameCollection,
  Promise<readonly OfficialFrame[]>
>();
const loadedCollections = new Set<OfficialFrameCollection>();

let version = 0;
const listeners = new Set<() => void>();
function changed() {
  version += 1;
  for (const listener of listeners) listener();
}

/** Loads the index (once). */
export function loadFrameIndex(): Promise<readonly OfficialFrameIndexEntry[]> {
  indexPromise ??= loadIndexModule().then(
    (module) => {
      index = module.OFFICIAL_FRAME_INDEX;
      indexById = new Map(index.map((entry) => [entry.id, entry]));
      indexByHash = new Map(index.map((entry) => [entry.hash, entry]));
      changed();
      return index;
    },
    (error) => {
      // Let a later call try again (a chunk can fail on a flaky network)
      indexPromise = null;
      throw error;
    },
  );
  return indexPromise;
}

/** Loads one collection's frames (once). */
export function loadFrameCollection(
  id: OfficialFrameCollection,
): Promise<readonly OfficialFrame[]> {
  let promise = collections.get(id);
  if (!promise) {
    promise = COLLECTION_LOADERS[id]().then(
      (module) => {
        for (const frame of module.default) frames.set(frame.id, frame);
        loadedCollections.add(id);
        changed();
        return module.default;
      },
      (error) => {
        collections.delete(id);
        throw error;
      },
    );
    collections.set(id, promise);
  }
  return promise;
}

/** Loads the frame with this id (its collection), or undefined if there's none. */
export async function loadOfficialFrame(
  id: string,
): Promise<OfficialFrame | undefined> {
  const loaded = frames.get(id);
  if (loaded) return loaded;
  await loadFrameIndex();
  const entry = indexById.get(id);
  if (!entry) return undefined;
  await loadFrameCollection(entry.collection);
  return frames.get(id);
}

/** The index, if it has loaded. */
export const peekFrameIndex = () => index;

/** A loaded official frame by id. */
export const peekOfficialFrame = (id: string): OfficialFrame | undefined =>
  frames.get(id);

/** Whether a collection's frames have loaded. */
export const isCollectionLoaded = (id: OfficialFrameCollection) =>
  loadedCollections.has(id);

/** The index entry by id, once the index has loaded. */
export const peekIndexEntry = (id: string) => indexById.get(id);

/**
 * The official frame a spec is an unchanged copy of, once the index has
 * loaded (undefined before, and for any edited or community spec).
 */
export function peekOfficialEntryOfSpec(
  spec: FrameSpec | undefined,
): OfficialFrameIndexEntry | undefined {
  if (!spec || indexByHash.size === 0) return undefined;
  return indexByHash.get(frameSpecHash(spec));
}

/**
 * The official frames for playground links, from what has loaded here:
 * playground-style.ts's default. Server code passes the full catalogue
 * (OFFICIAL_FRAME_RESOLVER in lib/community/catalog.ts).
 */
export const LOADED_OFFICIAL_FRAMES = {
  idOfSpec: (spec: FrameSpec) => peekOfficialEntryOfSpec(spec)?.id,
  specOf: (id: string) => peekOfficialFrame(id)?.spec,
};

// ── Watching ────────────────────────────────────────────────────────────────

/** Calls `listener` whenever more of the library loads. */
export function subscribeFrameLibrary(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** A number that changes each time more of the library loads. */
export const frameLibraryVersion = () => version;

/** Test helper: forget everything loaded. */
export function resetFrameLibraryForTests() {
  index = null;
  indexById = new Map();
  indexByHash = new Map();
  indexPromise = null;
  frames.clear();
  collections.clear();
  loadedCollections.clear();
  changed();
}
