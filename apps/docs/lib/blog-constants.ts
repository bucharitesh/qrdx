export const BLOG_CATEGORIES = [
  { label: "Overview", slug: null, href: "/blog" },
  { label: "Company News", slug: "company", href: "/blog/category/company" },
  {
    label: "Engineering",
    slug: "engineering",
    href: "/blog/category/engineering",
  },
  { label: "Education", slug: "education", href: "/blog/category/education" },
  { label: "Changelogs", slug: "changelog", href: "/changelogs" },
] as const;

export type BlogCategorySlug = (typeof BLOG_CATEGORIES)[number]["slug"];

export const SLUG_TO_CATEGORY: Record<string, string> = {
  company: "Company News",
  engineering: "Engineering",
  education: "Education",
};

/** A category slug from the list (own keys only, so "constructor" is not one). */
export const isCategorySlug = (slug: string): boolean =>
  Object.hasOwn(SLUG_TO_CATEGORY, slug);
