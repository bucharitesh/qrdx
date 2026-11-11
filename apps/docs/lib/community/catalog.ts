// QRdx's official frames straight from the engine (qrdx OFFICIAL_FRAMES):
// what the community shows for @qrdx until the seed puts them in the
// database (with the same slugs, so their links never change), and the
// full catalogue for server code. It holds every spec, so the browser
// loads the library through lib/frames/library.ts instead.
import { frameSpecHash, OFFICIAL_FRAMES, type OfficialFrame } from "qrdx";
import type { FrameSpec, QRCustomFrame } from "qrdx/types";
import { framePreviewStyle } from "./payloads";
import type {
  CommunityCreator,
  CommunityItemCard,
  CommunityItemDetail,
} from "./types";

export const OFFICIAL_CREATOR: CommunityCreator = {
  profileId: null,
  handle: "qrdx",
  displayName: "QRdx",
  avatarUrl: null,
  official: true,
  verified: true,
};

export const officialFrameValue = (frame: OfficialFrame): QRCustomFrame => ({
  style: "custom",
  spec: frame.spec,
});

export function officialFrameCard(frame: OfficialFrame): CommunityItemCard {
  return {
    id: null,
    type: "frame",
    slug: frame.id,
    name: frame.name,
    description: frame.description,
    creator: OFFICIAL_CREATOR,
    isOfficial: true,
    version: 1,
    likeCount: 0,
    saveCount: 0,
    useCount: 0,
    tags: frame.tags,
    publishedAt: null,
    preview: framePreviewStyle(officialFrameValue(frame)),
  };
}

export function officialFrameDetail(frame: OfficialFrame): CommunityItemDetail {
  return {
    ...officialFrameCard(frame),
    apply: { frame: officialFrameValue(frame) },
    contentTypes: frame.contentTypes,
    scanScore: null,
    remixedFromLabel: null,
    isLikedByMe: false,
    isSavedByMe: false,
    isMine: false,
  };
}

export const officialFrameCards = (): CommunityItemCard[] =>
  OFFICIAL_FRAMES.map(officialFrameCard);

export const findOfficialFrame = (slug: string): OfficialFrame | undefined =>
  OFFICIAL_FRAMES.find((frame) => frame.id === slug);

const BY_HASH = new Map(
  OFFICIAL_FRAMES.map((frame) => [frameSpecHash(frame.spec), frame]),
);

/** The official frame a spec is an unchanged copy of, if any. */
export function officialFrameOfSpec(
  spec: FrameSpec,
): OfficialFrame | undefined {
  return BY_HASH.get(frameSpecHash(spec));
}

/**
 * Every official frame, for playground links made on the server
 * (encodeStyleParam, decodeStyleParam, playgroundDesignHref).
 */
export const OFFICIAL_FRAME_RESOLVER = {
  idOfSpec: (spec: FrameSpec) => officialFrameOfSpec(spec)?.id,
  specOf: (id: string) => findOfficialFrame(id)?.spec,
};

export { BUILT_IN_SPEC_STYLES, builtInSpec } from "@/lib/frames/built-in";
