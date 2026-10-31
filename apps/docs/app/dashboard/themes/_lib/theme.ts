import type { ThemeStyles } from "@/types/theme";

/** "team" = shared with the active team; "personal" = only the signed-in user. */
export type ThemeScopeKind = "personal" | "team";

/** A saved theme as the editor picker and the Themes page see it. */
export interface SavedTheme {
  id: string;
  userId: string;
  name: string;
  organizationId: string | null;
  isDefault: boolean;
  style: ThemeStyles;
  createdAt: Date;
  updatedAt: Date;
  isPublished: boolean;
  scope: ThemeScopeKind;
  /** May rename, restyle, delete it and change its default */
  canEdit: boolean;
  /** Preselected for new codes and fresh playground sessions in the active workspace */
  isActiveDefault: boolean;
}

export type ThemeActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; upgrade?: boolean };
