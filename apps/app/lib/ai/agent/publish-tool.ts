import "server-only";

import { MAX_TAGS_PER_THEME } from "@repo/config";
import { type JSONValue, type Tool, tool } from "ai";
import z from "zod";
import {
  type CommunityDraft,
  communityDraft,
  DRAFT_DESCRIPTION_MAX,
  DRAFT_NAME_MAX,
  draftProblem,
} from "@/lib/community/draft";
import { MIN_GATE_SCORE } from "@/lib/community/scan-samples";
import { COMMUNITY_THEME_TAGS } from "@/lib/constants";
import { isGreat } from "@/lib/qr-design/repair";
import type { AgentContext } from "./tools";

// ── Community: publish_to_community ───────────────────────────────────────
// The chat agent's community tool, kept apart from ./tools.ts (which only
// registers it). It writes nothing at all: its card opens the publish
// dialog prefilled with the model's draft (components/editor/ai/
// publish-card.tsx), the person edits and publishes it there (actions/
// community.ts publishCommunityDesign, the saved theme's checks), and only
// then approves. The tool then reports what's really in the community
// (./community.ts), so the model can never claim a publish that didn't
// happen. Drafts are untrusted text (lib/community/draft.ts).

export const publishToCommunityInput = z.object({
  design_id: z
    .string()
    .optional()
    .describe(
      "A designId from design_qr; leave out to publish the code in the editor",
    ),
  name: z
    .string()
    .describe(
      `A short name for the look, at most ${DRAFT_NAME_MAX} characters, e.g. "Warm café Wi-Fi"`,
    ),
  description: z
    .string()
    .optional()
    .describe(
      `One plain sentence on what it suits, at most ${DRAFT_DESCRIPTION_MAX} characters`,
    ),
  tags: z
    .array(z.string())
    .optional()
    .describe(
      `Up to ${MAX_TAGS_PER_THEME} of: ${COMMUNITY_THEME_TAGS.join(", ")}`,
    ),
});

export type PublishToCommunityInput = z.infer<typeof publishToCommunityInput>;

/**
 * After the person answered the publish card: whether the item is really in
 * the community (never what the model said).
 */
export type PublishToCommunityOutput =
  | { ok: true; published: true; url: string; draft: CommunityDraft }
  | { ok: false; published: false; message: string };

export type PublishToCommunityTool = Tool<
  PublishToCommunityInput,
  PublishToCommunityOutput,
  AgentContext
>;

export const publishToCommunityTool: PublishToCommunityTool = tool({
  description:
    "Offer to share a look (style, frame and its text, border and logo icon, no content) in the QRdx community, free for anyone under CC0. You draft the name, description and tags; the user edits them and publishes in a dialog, or says not now. You never publish yourself. Only Great designs can be published.",
  inputSchema: publishToCommunityInput,
  contextSchema: z.custom<AgentContext>(),
  // What the model reads back: whether it's live and its address. Never the
  // item's text, which the person may have rewritten.
  toModelOutput: ({ output }) => ({
    type: "json",
    value: (output.ok
      ? { published: true, url: output.url }
      : { published: false, message: output.message }) as JSONValue,
  }),
  execute: async (
    input,
    { context, toolCallId },
  ): Promise<PublishToCommunityOutput> => {
    const item = await context.community.publishedFrom(
      context.userId,
      toolCallId,
    );
    if (!item) {
      return {
        ok: false,
        published: false,
        message: "The user didn't publish it. Nothing was shared.",
      };
    }
    return {
      ok: true,
      published: true,
      url: item.url,
      draft: communityDraft(input),
    };
  },
});

/**
 * Approval: refused below Great (as apply_design is) and when the model's
 * draft carries links or contact details; otherwise the card asks.
 */
export async function publishToCommunityApproval(
  input: PublishToCommunityInput,
  { toolContext }: { toolContext: AgentContext },
) {
  const problem = draftProblem(input);
  if (problem) {
    return {
      type: "denied" as const,
      reason: `${problem} Draft the name and description again without them.`,
    };
  }
  if (input.design_id) {
    const design = toolContext.designs.get(input.design_id);
    if (!design) {
      return {
        type: "denied" as const,
        reason: "No design with that id. Call design_qr first.",
      };
    }
    if (!isGreat(design)) {
      return {
        type: "denied" as const,
        reason: `Its scan score is ${design.score}, below Great. Only Great designs can be published.`,
      };
    }
    return "user-approval" as const;
  }
  const { base } = toolContext;
  const result = await toolContext.score(base.value, { ...base.rawStyle });
  return result.score >= MIN_GATE_SCORE
    ? ("user-approval" as const)
    : {
        type: "denied" as const,
        reason: `The code in the editor scores ${result.score}, below Great. Only Great designs can be published; repair it with design_qr first.`,
      };
}
