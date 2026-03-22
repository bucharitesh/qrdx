import { blogAuthorsSource } from "@/lib/source";

export interface ResolvedAuthor {
  id: string;
  name: string;
  role: string;
  avatar: string;
  twitter?: string;
  linkedin?: string;
  github?: string;
}

export function resolveAuthors(ids: string[]): ResolvedAuthor[] {
  return ids.map((id) => {
    const page = blogAuthorsSource.getPage([id]);

    if (!page) {
      throw new Error(
        `[blog-authors] Unknown author id "${id}". ` +
          `Create content/blog-authors/${id}.mdx to fix this.`,
      );
    }

    return {
      id,
      name: page.data.title,
      role: page.data.role,
      avatar: page.data.avatar,
      twitter: page.data.twitter,
      linkedin: page.data.linkedin,
      github: page.data.github,
    };
  });
}
