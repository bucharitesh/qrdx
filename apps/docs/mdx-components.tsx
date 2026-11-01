import { cn } from "@repo/design-system/lib/utils";
import { Accordion, Accordions } from "fumadocs-ui/components/accordion";
import { Cards } from "fumadocs-ui/components/card";
import * as FilesComponents from "fumadocs-ui/components/files";
import * as TabsComponents from "fumadocs-ui/components/tabs";
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";
import type { ComponentProps } from "react";
import { ComponentLinks } from "@/components/docs/registry/component-links";
import { ComponentPreview } from "@/components/docs/registry/component-preview";
import { ComponentSource } from "@/components/docs/registry/component-source";
import { InstallationTabs } from "@/components/docs/registry/installation-tabs";
import { PackageManagerTabs } from "@/components/docs/registry/package-manager-tabs";
import { GithubCard } from "@/components/mdx/github-card";
import { ErrorCorrectionDemo } from "@/components/sections/blog/error-correction-demo";
import { Figure } from "@/components/sections/blog/figure";
import { docsIcons } from "@/lib/docs-icons";

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...docsIcons,
    ...defaultMdxComponents,
    ...TabsComponents,
    ...FilesComponents,
    // An odd last card spans the row instead of sitting alone in a half-empty one.
    Cards: (props: ComponentProps<typeof Cards>) => (
      <Cards
        {...props}
        className={cn(
          "[&>[data-card]:last-child:nth-child(odd)]:col-span-full",
          props.className,
        )}
      />
    ),
    Accordion,
    Accordions,
    GithubCard,
    Figure,
    ErrorCorrectionDemo,
    ComponentLinks,
    ComponentPreview,
    ComponentSource,
    InstallationTabs,
    PackageManagerTabs,
    ...components,
  };
}

// fumadocs-ui/mdx augments "mdx/types.js" with React's JSX namespace.
declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
