import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@repo/design-system/components/ui/avatar";
import Link from "next/link";
import type { BlogAuthor } from "@/lib/blog-authors";

interface BlogAuthorBarProps {
  authorId: string;
  author: BlogAuthor;
  date: string;
  size?: "sm" | "md";
  linked?: boolean;
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function BlogAuthorBar({
  authorId,
  author,
  date,
  size = "sm",
  linked = true,
}: BlogAuthorBarProps) {
  const avatarSize = size === "md" ? "size-10" : "size-7";
  const authorHref = `/blog/authors/${authorId}`;

  const avatar = (
    <Avatar className={avatarSize}>
      <AvatarImage src={author.avatar} alt={author.name} />
      <AvatarFallback>{author.name.charAt(0)}</AvatarFallback>
    </Avatar>
  );

  const name = (
    <span className="text-sm font-medium text-secondary-foreground">
      {author.name}
    </span>
  );

  return (
    <div className="flex items-center gap-3">
      {linked ? <Link href={authorHref}>{avatar}</Link> : avatar}
      <div className="flex flex-col">
        {linked ? (
          <Link
            href={authorHref}
            className="text-sm font-medium text-secondary-foreground hover:underline underline-offset-4"
          >
            {author.name}
          </Link>
        ) : (
          name
        )}
        <time className="text-xs text-muted-foreground">
          {formatDate(date)}
        </time>
      </div>
    </div>
  );
}
