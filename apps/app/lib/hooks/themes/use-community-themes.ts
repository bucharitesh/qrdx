import { toast } from "@repo/design-system";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  getCommunityTagCounts,
  getCommunityThemes,
  getMyPublishedThemeIds,
  publishTheme,
  toggleLikeTheme,
  unpublishTheme,
  updateCommunityThemeTags,
} from "@/actions/community-themes";
import type {
  CommunityFilterOption,
  CommunitySortOption,
  CommunityTheme,
  CommunityThemesResponse,
  CommunityTimeRange,
} from "@/types/community";
import { ErrorCode } from "@/types/errors";
import { themeKeys } from "./use-themes-data";

export const communityKeys = {
  all: ["community-themes"] as const,
  list: (
    sort: CommunitySortOption,
    filter: CommunityFilterOption = "all",
    tags: string[] = [],
    timeRange: CommunityTimeRange = "all",
  ) =>
    [...communityKeys.all, "list", { sort, filter, tags, timeRange }] as const,
  myPublished: () => [...communityKeys.all, "my-published"] as const,
  tagCounts: () => [...communityKeys.all, "tag-counts"] as const,
};

export function useCommunityThemes(
  sort: CommunitySortOption,
  filter: CommunityFilterOption = "all",
  tags: string[] = [],
  timeRange: CommunityTimeRange = "all",
) {
  return useInfiniteQuery({
    queryKey: communityKeys.list(sort, filter, tags, timeRange),
    queryFn: async ({ pageParam }) => {
      return getCommunityThemes(
        sort,
        pageParam,
        undefined,
        filter,
        tags,
        timeRange,
      );
    },
    initialPageParam: undefined as string | number | undefined,
    getNextPageParam: (lastPage: CommunityThemesResponse) => {
      return lastPage.nextCursor ?? undefined;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useCommunityTagCounts() {
  return useQuery({
    queryKey: communityKeys.tagCounts(),
    queryFn: getCommunityTagCounts,
    staleTime: 1000 * 60 * 15, // 15 minutes
  });
}

export function useMyPublishedThemeIds() {
  return useQuery({
    queryKey: communityKeys.myPublished(),
    queryFn: getMyPublishedThemeIds,
    staleTime: 1000 * 60 * 10, // 10 minutes
  });
}

/** A publish the server refused, with its reason code (shown in the dialog). */
export class PublishRefusedError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PublishRefusedError";
  }
}

/** Refusals the publish dialog explains inline instead of in a toast. */
const INLINE_REFUSALS = new Set<ErrorCode>([
  ErrorCode.SCAN_GATE,
  ErrorCode.LICENSE_REQUIRED,
  ErrorCode.ALREADY_PUBLISHED,
  // A workspace theme this member can't publish, or can't publish here yet
  ErrorCode.THEME_NOT_FOUND,
  ErrorCode.COMMUNITY_UNAVAILABLE,
]);

export function usePublishTheme() {
  const t = useTranslations("editor.hooks.useCommunityThemes");
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      themeId,
      tags = [],
      acceptLicense,
    }: {
      themeId: string;
      tags?: string[];
      acceptLicense: boolean;
    }) => {
      const result = await publishTheme(themeId, tags, { acceptLicense });
      if (!result.success) {
        throw new PublishRefusedError(result.error.code, result.error.message);
      }
      return result.data;
    },
    onSuccess: () => {
      toast.success(t("themePublished"), {
        description: t("yourThemeIsNowVisible"),
      });
      queryClient.invalidateQueries({ queryKey: communityKeys.all });
      queryClient.invalidateQueries({ queryKey: communityKeys.myPublished() });
      queryClient.invalidateQueries({ queryKey: themeKeys.lists() });
    },
    onError: (error) => {
      if (
        error instanceof PublishRefusedError &&
        INLINE_REFUSALS.has(error.code)
      ) {
        return;
      }
      toast.error(t("failedToPublishTheme"), {
        description: (error as Error).message || t("anUnexpectedErrorOccurred"),
      });
    },
  });
}

export function useUnpublishTheme() {
  const t = useTranslations("editor.hooks.useCommunityThemes");
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (themeId: string) => unpublishTheme(themeId),
    onSuccess: () => {
      toast.success(t("themeUnpublished"), {
        description: t("yourThemeHasBeenRemoved"),
      });
      queryClient.invalidateQueries({ queryKey: communityKeys.all });
      queryClient.invalidateQueries({ queryKey: communityKeys.myPublished() });
      queryClient.invalidateQueries({ queryKey: themeKeys.lists() });
    },
    onError: (error) => {
      toast.error(t("failedToUnpublishTheme"), {
        description: (error as Error).message || t("anUnexpectedErrorOccurred"),
      });
    },
  });
}

export function useToggleLike() {
  const t = useTranslations("editor.hooks.useCommunityThemes");
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (communityThemeId: string) => {
      const result = await toggleLikeTheme(communityThemeId);
      if (!result.success) {
        throw new Error(result.error.message);
      }
      return { ...result.data, communityThemeId };
    },
    onMutate: async (communityThemeId: string) => {
      // Optimistic update across all community theme lists
      await queryClient.cancelQueries({ queryKey: communityKeys.all });

      const previousData = queryClient.getQueriesData({
        queryKey: communityKeys.all,
      });

      queryClient.setQueriesData(
        { queryKey: communityKeys.all },
        (old: unknown) => {
          if (!old || typeof old !== "object") return old;
          const data = old as {
            pages?: CommunityThemesResponse[];
            pageParams?: unknown[];
          };
          if (!data.pages) return old;
          return {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              themes: page.themes.map((theme: CommunityTheme) =>
                theme.id === communityThemeId
                  ? {
                      ...theme,
                      isLikedByMe: !theme.isLikedByMe,
                      likeCount: theme.isLikedByMe
                        ? theme.likeCount - 1
                        : theme.likeCount + 1,
                    }
                  : theme,
              ),
            })),
          };
        },
      );

      return { previousData };
    },
    onError: (_error, _variables, context) => {
      // Rollback optimistic updates
      if (context?.previousData) {
        for (const [queryKey, data] of context.previousData) {
          queryClient.setQueryData(queryKey, data);
        }
      }
      toast.error(t("failedToUpdateLike"), {
        description: t("anUnexpectedErrorOccurred"),
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: communityKeys.all });
    },
  });
}

export function useUpdateCommunityThemeTags() {
  const t = useTranslations("editor.hooks.useCommunityThemes");
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      themeId,
      tags,
    }: {
      themeId: string;
      tags: string[];
    }) => {
      const result = await updateCommunityThemeTags(themeId, tags);
      if (!result.success) {
        throw new Error(result.error.message);
      }
      return result.data;
    },
    onSuccess: () => {
      toast.success(t("tagsUpdated"), {
        description: t("yourThemeTagsHaveBeen"),
      });
      queryClient.invalidateQueries({ queryKey: communityKeys.all });
    },
    onError: (error) => {
      toast.error(t("failedToUpdateTags"), {
        description: (error as Error).message || t("anUnexpectedErrorOccurred"),
      });
    },
  });
}
