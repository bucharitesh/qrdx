import "server-only";

import type { ThemeStyles } from "@/types/theme";

// Custom templates are saved themes: a look (colours, shapes, frame and its
// text, border, logo) without content, in the user's account, listed under
// Themes and offered in the editor. The chat saves them through the same
// server action as the editor's "Save theme" dialog (actions/qr-themes.ts),
// so the plan's saved-theme limit and its message are the same everywhere.
//
// The store is passed in (TemplateStore) so tests use a fake and never touch
// the database. A future authenticated MCP tool would use the same store
// with the API key's owner (see app/api/mcp/tools.ts).

export const TEMPLATE_NAME_MAX_LENGTH = 50;

export type TemplateQuota =
  | { allowed: true }
  | { allowed: false; message: string };

export type SaveTemplateResult =
  | { ok: true; id: string; name: string }
  | { ok: false; code: "LIMIT_REACHED" | "FAILED"; message: string };

export interface TemplateStore {
  /** Whether the user can save one more template on their plan */
  quota(userId: string): Promise<TemplateQuota>;
  save(
    userId: string,
    template: { name: string; style: ThemeStyles },
  ): Promise<SaveTemplateResult>;
}

/** The signed-in user's saved themes, through actions/qr-themes.ts. */
export const accountTemplateStore: TemplateStore = {
  async quota(userId) {
    const [{ getPlan, getPlanLimits }, { countThemesInScope }] =
      await Promise.all([
        import("@/lib/plans"),
        import("@/app/dashboard/themes/_lib/queries"),
      ]);
    const limit = getPlanLimits(await getPlan(userId)).savedThemes;
    if (!Number.isFinite(limit)) return { allowed: true };
    const used = await countThemesInScope({ userId, organizationId: null });
    return used < limit
      ? { allowed: true }
      : {
          allowed: false,
          message: `You have reached the limit of ${limit} saved themes on the Free plan. Upgrade to Pro for unlimited themes.`,
        };
  },
  async save(_userId, { name, style }) {
    // createTheme reads the session itself, as the editor's dialog does.
    const { createTheme } = await import("@/actions/qr-themes");
    try {
      const result = await createTheme({ name, style });
      if (result.success) {
        return { ok: true, id: result.data.id, name: result.data.name };
      }
      return {
        ok: false,
        code:
          result.error.code === "THEME_LIMIT_REACHED"
            ? "LIMIT_REACHED"
            : "FAILED",
        message: result.error.message,
      };
    } catch (error) {
      return {
        ok: false,
        code: "FAILED",
        message:
          error instanceof Error && error.name === "ValidationError"
            ? error.message
            : "The template couldn't be saved. Please try again.",
      };
    }
  },
};
