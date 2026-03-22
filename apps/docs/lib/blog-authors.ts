export interface BlogAuthor {
  name: string;
  role: string;
  avatar: string;
  twitter?: string;
  github?: string;
}

export const authors: Record<string, BlogAuthor> = {
  ritesh: {
    name: "Ritesh Bucha",
    role: "Founder & Creator, QRdx",
    avatar: "https://github.com/bucharitesh.png",
    twitter: "bucharitesh",
    github: "bucharitesh",
  },
};

export function getAuthor(id: string): BlogAuthor | undefined {
  return authors[id];
}

export function getAuthorSlug(id: string): string {
  return id;
}

export function getAllAuthorSlugs(): string[] {
  return Object.keys(authors);
}
