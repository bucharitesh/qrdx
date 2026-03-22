"use client";

import { cn } from "@repo/design-system/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BLOG_CATEGORIES } from "@/lib/blog-constants";

export { BLOG_CATEGORIES, SLUG_TO_CATEGORY } from "@/lib/blog-constants";
export type { BlogCategorySlug } from "@/lib/blog-constants";

interface BlogCategoriesProps {
  className?: string;
}

export function BlogCategories({ className }: BlogCategoriesProps) {
  const pathname = usePathname();

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {BLOG_CATEGORIES.map((category) => {
        const isActive = pathname === category.href;
        return (
          <Link
            key={category.href}
            href={category.href}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-secondary-foreground text-background"
                : "text-muted-foreground hover:text-secondary-foreground hover:bg-muted",
            )}
          >
            {category.label}
          </Link>
        );
      })}
    </div>
  );
}
