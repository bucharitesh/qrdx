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
}

interface BlogListProps {
  posts: BlogPost[];
  showCategories?: boolean;
}

export function BlogList({ posts, showCategories = true }: BlogListProps) {
  return (
    <>
      {showCategories && (
        <div className="border-b border-border px-6 md:px-10 py-6">
          <div className="max-w-6xl mx-auto">
            <BlogCategories />
          </div>
        </div>
      )}

      <div className="px-6 min-h-screen">
        {posts.length === 0 ? (
          <p className="text-center text-muted-foreground py-20">
            No posts in this category yet.
          </p>
        ) : (
          <div className="grid w-full max-w-7xl grid-cols-2 md:grid-cols-3 border-l border-border auto-rows-fr">
            {posts.map((post) => (
              <BlogCard
                key={post.slug}
                title={post.title}
                description={post.description}
                slug={post.slug}
                date={post.date}
                author={post.author}
                image={post.image}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
