// What the AI chat drafts for a community publish (publish_to_community in
// lib/ai/agent/tools.ts): a name, a description and tags for the person to
// edit and confirm in the publish dialog. The model's text is untrusted, the
// same as text read back from the community: it's cut short, made one line
// and stripped of links, emails, phone numbers, @mentions and markup before
// anyone sees it, and the server checks it again when the person publishes
// (lib/community/publish.ts cleanDetails). Safe to import anywhere.

import { MAX_TAGS_PER_THEME } from "@repo/config";
import { COMMUNITY_THEME_TAGS } from "@/lib/constants";
import { textProblem, untrustedText } from "./text";

/** Shorter than the dialog allows: a draft is a starting point. */
export const DRAFT_NAME_MAX = 60;
export const DRAFT_DESCRIPTION_MAX = 160;

export interface CommunityDraft {
  name: string;
  description: string;
  tags: string[];
}

const MENTIONS = /(^|\s)@[\w.-]+/g;

const clean = (text: string | null | undefined, max: number) =>
  untrustedText((text ?? "").replace(MENTIONS, "$1"), max);

/** The model's draft, made safe to show and to prefill the dialog with. */
export function communityDraft(input: {
  name?: string | null;
  description?: string | null;
  /** Partial while the model streams it */
  tags?: readonly (string | undefined)[] | null;
}): CommunityDraft {
  const vocabulary = COMMUNITY_THEME_TAGS as readonly string[];
  const tags = [
    ...new Set(
      (input.tags ?? [])
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => tag.trim().toLowerCase())
        .filter((tag) => vocabulary.includes(tag)),
    ),
  ].slice(0, MAX_TAGS_PER_THEME);
  return {
    name: clean(input.name, DRAFT_NAME_MAX) || "AI design",
    description: clean(input.description, DRAFT_DESCRIPTION_MAX),
    tags,
  };
}

/**
 * Why the model's raw draft is refused before it reaches the person, or
 * null: contact details or links in the name or description. The model is
 * told to draft it again without them.
 */
export function draftProblem(input: {
  name?: string | null;
  description?: string | null;
}): string | null {
  for (const text of [input.name ?? "", input.description ?? ""]) {
    const problem = textProblem(text);
    if (problem) return problem;
  }
  return null;
}
