/** biome-ignore-all lint/suspicious/noArrayIndexKey: false positive */
"use client";

import { Skeleton } from "@repo/design-system/components/ui/skeleton";
import {
  SidebarButton,
  SidebarSection,
} from "@/components/community/browse-sidebar";
import { useCommunityTagCounts } from "@/lib/hooks/themes/use-community-themes";
import { useSessionGuard } from "@/lib/hooks/use-gaurds";
import type { CommunityFilterOption } from "@/types/community";

interface CommunitySidebarProps {
  filter: CommunityFilterOption;
  selectedTags: string[];
  onFilterChange: (filter: CommunityFilterOption) => void;
  onTagToggle: (tag: string) => void;
}

const filterItems = [
  { value: "all" as const, label: "All themes" },
  { value: "mine" as const, label: "My themes" },
  { value: "liked" as const, label: "Liked themes" },
];

export function CommunitySidebarContent({
  filter,
  selectedTags,
  onFilterChange,
  onTagToggle,
}: CommunitySidebarProps) {
  const { data: tagCounts = [], isLoading: isLoadingTags } =
    useCommunityTagCounts();
  const { checkValidSession } = useSessionGuard();

  const handleFilterClick = (value: CommunityFilterOption) => {
    if (value === "mine" || value === "liked") {
      if (!checkValidSession("signin")) return;
    }
    onFilterChange(value);
  };

  return (
    <>
      {filterItems.map((item) => (
        <SidebarButton
          active={filter === item.value}
          key={item.value}
          onClick={() => handleFilterClick(item.value)}
          strong
        >
          {item.label}
        </SidebarButton>
      ))}

      {isLoadingTags ? (
        <SidebarSection title="Tags">
          <div className="space-y-1 px-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton className="h-7 w-full rounded-lg" key={i} />
            ))}
          </div>
        </SidebarSection>
      ) : tagCounts.length > 0 ? (
        <SidebarSection title="Tags">
          {tagCounts.map(({ tag, count }) => (
            <SidebarButton
              active={selectedTags.includes(tag)}
              count={count}
              key={tag}
              onClick={() => onTagToggle(tag)}
            >
              {tag}
            </SidebarButton>
          ))}
        </SidebarSection>
      ) : null}
    </>
  );
}
