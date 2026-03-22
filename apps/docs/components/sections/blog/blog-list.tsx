"use client";

import { BlogCard } from "./blog-card";
import { BlogCategoryFilter } from "./blog-categories";

interface BlogPost {
  slug: string;
  title: string;
  description: string;
  date: string;
  author: string;
  category: string;
  image?: string;
}

interface BlogListProps {
  posts: BlogPost[];
}

export function BlogList({ posts }: BlogListProps) {
  return (
    <BlogCategoryFilter
      posts={posts}
      renderPosts={(filteredPosts) => (
        <div className="max-w-6xl mx-auto px-6 md:px-10 py-10 md:py-16">
          {filteredPosts.length === 0 ? (
            <p className="text-center text-muted-foreground py-20">
              No posts in this category yet.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-10">
              {filteredPosts.map((post) => (
                <BlogCard
                  key={post.slug}
                  title={post.title}
                  description={post.description ?? ""}
                  slug={post.slug}
                  date={post.date}
                  authorId={post.author}
                  image={post.image}
                />
              ))}
            </div>
          )}
        </div>
      )}
    />
  );
}
