import { toast } from "@repo/design-system";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
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

export function usePublishTheme() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      themeId,
      tags = [],
    }: {
      themeId: string;
      tags?: string[];
    }) => {
      const result = await publishTheme(themeId, tags);
      if (!result.success) {
        if (result.error.code === ErrorCode.ALREADY_PUBLISHED) {
          toast.error("Already published", {
            description: result.error.message,
          });
        }
        throw new Error(result.error.message);
      }
      return result.data;
    },
    onSuccess: () => {
      toast.success("Theme published", {
        description: "Your theme is now visible in the community.",
      });
      queryClient.invalidateQueries({ queryKey: communityKeys.all });
      queryClient.invalidateQueries({ queryKey: communityKeys.myPublished() });
      queryClient.invalidateQueries({ queryKey: themeKeys.lists() });
    },
    onError: (error) => {
      if (
        (error as Error).message.includes("already published") ||
        (error as Error).message.includes("Already published")
      ) {
        return;
      }
      toast.error("Failed to publish theme", {
        description:
          (error as Error).message || "An unexpected error occurred.",
      });
    },
  });
}

export function useUnpublishTheme() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (themeId: string) => unpublishTheme(themeId),
    onSuccess: () => {
      toast.success("Theme unpublished", {
        description: "Your theme has been removed from the community.",
      });
      queryClient.invalidateQueries({ queryKey: communityKeys.all });
      queryClient.invalidateQueries({ queryKey: communityKeys.myPublished() });
      queryClient.invalidateQueries({ queryKey: themeKeys.lists() });
    },
    onError: (error) => {
      toast.error("Failed to unpublish theme", {
        description:
          (error as Error).message || "An unexpected error occurred.",
      });
    },
  });
}

export function useToggleLike() {
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
      toast.error("Failed to update like", {
        description: "An unexpected error occurred.",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: communityKeys.all });
    },
  });
}

export function useUpdateCommunityThemeTags() {
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
      toast.success("Tags updated", {
        description: "Your theme tags have been updated.",
      });
      queryClient.invalidateQueries({ queryKey: communityKeys.all });
    },
    onError: (error) => {
      toast.error("Failed to update tags", {
        description:
          (error as Error).message || "An unexpected error occurred.",
      });
    },
  });
}
