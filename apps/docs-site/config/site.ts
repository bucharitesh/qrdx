import { GITHUB_REPO_URL, SUPPORT_EMAIL } from "@repo/config";

/** The links the docs' help home uses (the main app's config/site.tsx has the rest). */
export const siteConfig = {
  links: {
    email: SUPPORT_EMAIL,
    github: GITHUB_REPO_URL,
  },
} as const;
