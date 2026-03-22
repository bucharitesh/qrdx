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
}

export function BlogCard({
  title,
  description,
  slug,
  date,
  author,
  image,
}: BlogCardProps) {
  return (
    <Link
      href={`/blog/${slug}`}
      className="w-full h-full flex flex-col border-r border-b border-border hover:bg-accent/50 transition-colors duration-100"
    >
      <div className="relative h-52 w-full shrink-0 overflow-hidden">
        <Image
          src={image}
          alt={title}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        />
      </div>
      <div className="flex flex-1 flex-col justify-between p-6">
        <div>
          <h2 className="line-clamp-2 text-lg font-bold tracking-tight text-foreground">
            {title}
          </h2>
          <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
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
            })}
          </time>
        </div>
      </div>
    </Link>
  );
}
