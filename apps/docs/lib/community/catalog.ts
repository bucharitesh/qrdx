// QRdx's official frames straight from the engine (qrdx OFFICIAL_FRAMES):
// what the editor's frame picker offers, and what the community shows for
// @qrdx until the seed puts them in the database (with the same slugs, so
// their links never change). Safe to import anywhere.
import {
  BUILT_IN_FRAME_SPECS,
  OFFICIAL_FRAMES,
  type OfficialFrame,
} from "qrdx";
import type { FrameSpec, FrameStyle, QRCustomFrame } from "qrdx/types";
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
  };
}

export const officialFrameCards = (): CommunityItemCard[] =>
  OFFICIAL_FRAMES.map(officialFrameCard);

export const findOfficialFrame = (slug: string): OfficialFrame | undefined =>
  OFFICIAL_FRAMES.find((frame) => frame.id === slug);

/** The official frame a spec is an unchanged copy of, if any. */
export function officialFrameOfSpec(
  spec: FrameSpec,
): OfficialFrame | undefined {
  const json = JSON.stringify(spec);
  return OFFICIAL_FRAMES.find((frame) => JSON.stringify(frame.spec) === json);
}

/** Built-in frame styles that can be opened as an editable spec. */
export const BUILT_IN_SPEC_STYLES = Object.keys(
  BUILT_IN_FRAME_SPECS,
) as FrameStyle[];

export const builtInSpec = (style: FrameStyle): FrameSpec | undefined =>
  BUILT_IN_FRAME_SPECS[style];
