"use client";

import { cn } from "@repo/design-system/lib/utils";
import { useCallback, useState } from "react";

const categories = [
  "Overview",
  "Company News",
  "Engineering",
  "Education",
  "Changelog",
] as const;

export type BlogCategory = (typeof categories)[number];

interface BlogCategoriesProps {
  onCategoryChange: (category: BlogCategory) => void;
  activeCategory: BlogCategory;
}

export function BlogCategories({
  onCategoryChange,
  activeCategory,
}: BlogCategoriesProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {categories.map((category) => (
        <button
          key={category}
          type="button"
          onClick={() => onCategoryChange(category)}
          className={cn(
            "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
            activeCategory === category
              ? "bg-secondary-foreground text-background"
              : "text-muted-foreground hover:text-secondary-foreground hover:bg-muted"
          )}
        >
          {category}
        </button>
      ))}
    </div>
  );
}

interface BlogCategoryFilterProps {
  posts: Array<{
    slug: string;
    title: string;
    description: string;
    date: string;
    author: string;
    category: string;
    image?: string;
  }>;
  renderPosts: (
    filteredPosts: BlogCategoryFilterProps["posts"]
  ) => React.ReactNode;
}

export function BlogCategoryFilter({
  posts,
  renderPosts,
}: BlogCategoryFilterProps) {
  const [activeCategory, setActiveCategory] =
    useState<BlogCategory>("Overview");

  const filteredPosts =
    activeCategory === "Overview"
      ? posts
      : posts.filter((post) => post.category === activeCategory);

  const handleCategoryChange = useCallback((category: BlogCategory) => {
    setActiveCategory(category);
  }, []);

  return (
    <>
      <div className="border-b border-border px-6 md:px-10 py-6">
        <div className="max-w-6xl mx-auto">
          <BlogCategories
            activeCategory={activeCategory}
            onCategoryChange={handleCategoryChange}
          />
        </div>
      </div>
      {renderPosts(filteredPosts)}
    </>
  );
}
