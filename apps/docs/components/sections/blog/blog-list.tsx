import { BlogCard } from "./blog-card";
import { BlogCategories } from "./blog-categories";

interface BlogPost {
  slug: string;
  title: string;
  description: string;
  date: string;
  author: {
    name: string;
    avatar: string;
  }[];
  category: string;
  image: string;
  imageAlt?: string;
}

interface BlogListProps {
  posts: BlogPost[];
  showCategories?: boolean;
  /** Render the first post as a full-width featured card */
  featureFirst?: boolean;
}

export function BlogList({
  posts,
  showCategories = true,
  featureFirst = false,
}: BlogListProps) {
  return (
    <>
      {showCategories && (
        <div className="border-b border-border px-6 md:px-10 py-6">
          <div className="max-w-6xl mx-auto">
            <BlogCategories />
          </div>
        </div>
      )}

      <div className="px-6 pb-16">
        {posts.length === 0 ? (
          <p className="text-center text-muted-foreground py-20">
            No posts in this category yet.
          </p>
        ) : (
          <div className="grid w-full max-w-7xl grid-cols-1 sm:grid-cols-2 md:grid-cols-3 border-l border-border">
            {posts.map((post, index) => (
              <BlogCard
                key={post.slug}
                title={post.title}
                description={post.description}
                slug={post.slug}
                date={post.date}
                author={post.author}
                image={post.image}
                imageAlt={post.imageAlt}
                featured={featureFirst && index === 0}
                priority={index < (featureFirst ? 1 : 3)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
