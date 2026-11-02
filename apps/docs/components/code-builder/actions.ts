"use server";

// Everything the code builder reads as it opens, in one round trip. Server
// actions from a page run one after another, so the five separate reads it
// started with (settings, themes, folders, tags, domains) held the form
// back by several round trips. Read-only; each part fails on its own and the
// failure is reported, never hidden.

import { getUserSettings } from "@/actions/user-settings";
import {
  listFolders,
  listTags,
  type TagRow,
} from "@/app/dashboard/codes/_lib/organize";
import type { FolderRow } from "@/app/dashboard/codes/_lib/organize-shared";
import {
  type DomainOptions,
  getDomainOptions,
} from "@/app/dashboard/domains/_lib/domains";
import { listVisibleThemes } from "@/app/dashboard/themes/_lib/queries";
import type { SavedTheme } from "@/app/dashboard/themes/_lib/theme";
import { getActiveScope } from "@/lib/scope";
import { logError } from "@/lib/shared";
import { UnauthorizedError } from "@/types/errors";

export interface CodeBuilderData {
  /** Saved themes the workspace can use; null when they couldn't load */
  themes: SavedTheme[] | null;
  folders: FolderRow[] | null;
  tags: TagRow[] | null;
  /** Custom domains and back-half rights; null when they couldn't load */
  domains: DomainOptions | null;
  /** user.settings.keyboardShortcuts (on unless switched off) */
  keyboardShortcuts: boolean;
  /** What couldn't load, in words for the form */
  problems: string[];
}

export type CodeBuilderDataResult =
  | { success: true; data: CodeBuilderData }
  | { success: false; error: { message: string } };

function settled<T>(
  result: PromiseSettledResult<T>,
  part: string,
  problems: string[],
  message: string,
): T | null {
  if (result.status === "fulfilled") return result.value;
  logError(result.reason as Error, { action: "getCodeBuilderData", part });
  problems.push(message);
  return null;
}

export async function getCodeBuilderData(): Promise<CodeBuilderDataResult> {
  let scope: Awaited<ReturnType<typeof getActiveScope>>;
  try {
    scope = await getActiveScope();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return {
        success: false,
        error: { message: "Sign in again to create codes." },
      };
    }
    logError(error as Error, { action: "getCodeBuilderData" });
    return {
      success: false,
      error: { message: "Couldn't load the builder. Try again." },
    };
  }

  const [themes, folders, tags, domains, settings] = await Promise.allSettled([
    listVisibleThemes(scope),
    listFolders(scope),
    listTags(scope),
    getDomainOptions(scope),
    getUserSettings(),
  ] as const);
  const problems: string[] = [];
  return {
    success: true,
    data: {
      themes: settled(themes, "themes", problems, "Saved themes didn't load."),
      folders: settled(folders, "folders", problems, "Folders didn't load."),
      tags: settled(tags, "tags", problems, "Tags didn't load."),
      domains: settled(
        domains,
        "domains",
        problems,
        "Custom domains didn't load, so codes use the default short link.",
      ),
      keyboardShortcuts:
        settings.status === "fulfilled"
          ? (settings.value?.keyboardShortcuts ?? true)
          : true,
      problems,
    },
  };
}
