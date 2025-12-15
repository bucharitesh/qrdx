import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { DocsLayoutProps } from "fumadocs-ui/layouts/docs";
import { baseOptions, linkItems, logo } from "@/lib/layout.shared";
import { source } from "@/lib/source";
import "katex/dist/katex.min.css";

const DOCS_LAYOUT_PROPS: DocsLayoutProps = {
  tree: source.pageTree,
  ...baseOptions(),
  links: linkItems.filter((item) => item.type === "icon"),
  nav: {
    ...baseOptions().nav,
    title: (
      <>
        {logo}
        <span className="font-medium in-[.uwu]:hidden max-md:hidden">qrdx</span>
      </>
    ),
  },
};

export default function Layout({ children }: LayoutProps<"/docs">) {
  return <DocsLayout {...DOCS_LAYOUT_PROPS}>{children}</DocsLayout>;
}
