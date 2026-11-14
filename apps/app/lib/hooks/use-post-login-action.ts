/** biome-ignore-all lint/suspicious/noExplicitAny: false positive */

import { useEffect } from "react";

export type PostLoginActionType =
  | "SAVE_THEME"
  | "AI_GENERATE_FROM_PAGE"
  | "AI_GENERATE_FROM_CHAT"
  | "AI_GENERATE_FROM_CHAT_SUGGESTION"
  | "AI_GENERATE_EDIT"
  | "AI_GENERATE_RETRY"
  | "SAVE_THEME_FOR_SHARE"
  /** The community sheet's "Publish this style": save if needed, then publish. */
  | "SAVE_THEME_FOR_PUBLISH"
  | "CHECKOUT"
  | "LIKE_THEME"
  /** The playground's Static/Dynamic choice: make the URL code dynamic. */
  | "MAKE_DYNAMIC"
  // The playground's Art tab (hub phase 3)
  /** AI art's Generate, signed out: back on the Art tab, run it (components/editor/art/ai-art-panel.tsx). */
  | "AI_ART_GENERATE"
  /**
   * The playground's "Make it dynamic…" or a hosted page type: open the code
   * builder or the page gallery over the editor (components/code-builder/playground-host.tsx).
   */
  | "OPEN_CODE_BUILDER";

export interface PostLoginActionPayload<T = any> {
  type: PostLoginActionType;
  data?: T;
}

export type StoredPostLoginAction = PostLoginActionPayload | null;

type PostLoginHandler<T = any> = (data?: T) => void | Promise<void>;

const handlers: Map<PostLoginActionType, PostLoginHandler> = new Map();
const readyActions: Set<PostLoginActionType> = new Set();
let pendingAction: StoredPostLoginAction = null;

export function usePostLoginAction<T = any>(
  actionType: PostLoginActionType,
  handler: PostLoginHandler<T>,
) {
  useEffect(() => {
    if (!actionType) return;

    handlers.set(actionType, handler as PostLoginHandler);
    readyActions.add(actionType);

    // If there's a pending action that matches this one, execute it
    if (pendingAction && pendingAction.type === actionType) {
      executePostLoginActionInternal(pendingAction);
      pendingAction = null;
    }

    return () => {
      const handler = handlers.get(actionType);
      if (handler) {
        handlers.delete(actionType);
        readyActions.delete(actionType);
      }
    };
  }, [actionType, handler]);
}

// Internal function to actually execute handlers
async function executePostLoginActionInternal(
  actionPayload: StoredPostLoginAction,
) {
  if (!actionPayload) return;

  const actionType = actionPayload.type;
  const actionData = actionPayload.data;
  const handler = handlers.get(actionType);

  if (handler) {
    await handler(actionData);
  }
}

// This function should be called when a user successfully logs in
export async function executePostLoginAction(
  actionPayload: StoredPostLoginAction,
) {
  if (!actionPayload) return;

  const actionType = actionPayload.type;

  // If handlers for this action type are ready, execute immediately
  if (readyActions.has(actionType)) {
    await executePostLoginActionInternal(actionPayload);
  } else {
    // Otherwise, set as pending to be executed when handlers are registered
    pendingAction = actionPayload;
  }
}
