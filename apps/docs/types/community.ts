import type { ThemeStyles } from "@/types/theme";

export interface CommunityThemeAuthor {
  id: string;
  name: string;
  image: string | null;
}

export interface CommunityTheme {
  id: string;
  /**
   * Public id of the published design (never the saved theme's id, whose
   * /playground/<id> link shows the whole saved theme)
   */
  themeId: string;
  name: string;
  styles: ThemeStyles;
  author: CommunityThemeAuthor;
  likeCount: number;
  isLikedByMe: boolean;
  publishedAt: string;
  tags: string[];
}

export type CommunitySortOption = "popular" | "newest" | "oldest";
export type CommunityTimeRange = "weekly" | "monthly" | "all";
export type CommunityFilterOption = "all" | "mine" | "liked";

export interface CommunityThemesResponse {
  themes: CommunityTheme[];
  nextCursor: string | number | null;
}
