import Image from "next/image";
import Link from "next/link";
import { getAuthor } from "@/lib/blog-authors";
import { BlogAuthorBar } from "./blog-author-bar";

interface BlogCardProps {
  title: string;
  description: string;
  slug: string;
  date: string;
  authorId: string;
  image?: string;
}

export function BlogCard({
  title,
  description,
  slug,
  date,
  authorId,
  image,
}: BlogCardProps) {
  const author = getAuthor(authorId);

  return (
    <Link href={`/blog/${slug}`} className="group flex flex-col">
      <div className="relative aspect-16/10 w-full overflow-hidden rounded-xl border border-border bg-muted/30">
        {image ? (
          <Image
            src={image}
            alt={title}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="size-12 rounded-lg bg-muted" />
          </div>
        )}
      </div>
      <div className="mt-4 flex flex-1 flex-col gap-2">
        <h3 className="text-lg font-semibold tracking-tight text-secondary-foreground group-hover:underline underline-offset-4">
          {title}
        </h3>
        <p className="text-sm text-muted-foreground line-clamp-2">
          {description}
        </p>
        {author && (
          <div className="mt-auto pt-3">
            <BlogAuthorBar authorId={authorId} author={author} date={date} linked={false} />
          </div>
        )}
      </div>
    </Link>
  );
}
