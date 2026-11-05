import "server-only";

// The chat's publish_to_community tool never publishes: the person does, in
// the publish dialog its card opens (components/editor/ai/publish-card.tsx,
// actions/community.ts publishCommunityDesign, which tags the item with the
// tool call's id). After they approve, the tool only asks this store whether
// that item exists, so the model can't claim a publish that didn't happen.
//
// The store is passed in (AgentContext.community) so tests use a fake and
// never touch the database.

export const CHAT_DRAFT_SOURCE = "ai_chat";

export interface CommunityPublishStore {
  /** The item the person published from the draft `draftId`, or null */
  publishedFrom(
    userId: string,
    draftId: string,
  ): Promise<{ url: string } | null>;
}

/** Reads community_item through lib/community/publish.ts. */
export const accountCommunityStore: CommunityPublishStore = {
  async publishedFrom(userId, draftId) {
    const [{ findPublishedFrom }, { itemPath }] = await Promise.all([
      import("@/lib/community/publish"),
      import("@/lib/community/types"),
    ]);
    const item = await findPublishedFrom(userId, {
      kind: CHAT_DRAFT_SOURCE,
      id: draftId,
    });
    return item ? { url: itemPath(item.type, item.slug) } : null;
  },
};
