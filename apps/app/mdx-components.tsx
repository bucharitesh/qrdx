import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";
import { GithubCard } from "@/components/mdx/github-card";
import { IfAvailable } from "@/components/mdx/if-available";
import { NpmStatus } from "@/components/mdx/npm-status";
import { ErrorCorrectionDemo } from "@/components/sections/blog/error-correction-demo";
import { Figure } from "@/components/sections/blog/figure";

// The components the site's MDX uses: blog posts, comparisons, customer
// stories, legal pages and changelog entries (source.config.ts). The docs
// have their own (apps/docs/mdx-components.tsx).
export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    GithubCard,
    IfAvailable,
    NpmStatus,
    Figure,
    ErrorCorrectionDemo,
    ...components,
  };
}

// fumadocs-ui/mdx augments "mdx/types.js" with React's JSX namespace.
declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
