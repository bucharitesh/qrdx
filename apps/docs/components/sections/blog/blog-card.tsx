import { cn } from "@repo/design-system/lib/utils";
import Image from "next/image";
import Link from "next/link";

interface BlogCardProps {
  title: string;
  description: string;
  slug: string;
  date: string;
  author: {
    name: string;
    avatar: string;
  }[];
  image: string;
  imageAlt?: string;
  featured?: boolean;
}

export function BlogCard({
  title,
  description,
  slug,
  date,
  author,
  image,
  imageAlt,
  featured = false,
}: BlogCardProps) {
  return (
    <Link
      href={`/blog/${slug}`}
      className={cn(
        "w-full h-full flex flex-col border-r border-b border-border hover:bg-accent/50 transition-colors duration-100",
        featured && "col-span-full md:grid md:grid-cols-2",
      )}
    >
      <div
        className={cn(
          "relative aspect-video w-full shrink-0 overflow-hidden",
          featured && "md:border-r md:border-border",
        )}
      >
        <Image
          src={image}
          alt={imageAlt ?? title}
          fill
          className="object-cover"
          priority={featured}
          sizes={
            featured
              ? "(max-width: 768px) 100vw, 640px"
              : "(max-width: 640px) 100vw, (max-width: 768px) 50vw, 33vw"
          }
        />
      </div>
      <div
        className={cn(
          "flex flex-1 flex-col justify-between p-6",
          featured && "md:p-10",
        )}
      >
        <div>
          {featured && (
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Latest post
            </p>
          )}
          <h2
            className={cn(
              "line-clamp-2 font-bold tracking-tight text-foreground",
              featured ? "text-2xl md:text-3xl" : "text-lg",
            )}
          >
            {title}
          </h2>
          <p
            className={cn(
              "mt-2 text-sm text-muted-foreground",
              featured ? "line-clamp-4 md:text-base" : "line-clamp-2",
            )}
          >
            {description}
          </p>
        </div>
        <div className="mt-6 flex items-center gap-2">
          <div className="flex items-center -space-x-2">
            {author.map((authorItem) => (
              <img
                alt={authorItem.name}
                key={authorItem.name}
                loading="lazy"
                width="28"
                height="28"
                className="rounded-full ring-2 ring-background"
                src={authorItem.avatar}
              />
            ))}
          </div>
          <time dateTime={date} className="text-sm text-muted-foreground">
            {new Date(date).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
              timeZone: "UTC",
            })}
          </time>
        </div>
      </div>
    </Link>
  );
}
