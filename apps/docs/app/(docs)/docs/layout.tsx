import type { DocsLayoutProps } from "fumadocs-ui/layouts/docs";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { baseOptions, linkItems, logo } from "@/lib/layout.shared";
import { source } from "@/lib/source";
import "katex/dist/katex.min.css";
import { RootProvider } from "fumadocs-ui/provider/base";
import CustomSearchDialog from "@/components/search";

const DOCS_LAYOUT_PROPS: DocsLayoutProps = {
  tree: source.pageTree,
  ...baseOptions(),
  links: linkItems.filter((item) => item.type === "icon"),
  nav: {
    ...baseOptions().nav,
    title: (
      <>
        {logo}
        <span className="font-medium in-[docs_layout_&]:text-[15px]">QRdx</span>
      </>
    ),
  },
};

export default function Layout({ children }: LayoutProps<"/docs">) {
  return (
    <RootProvider
      search={{
        SearchDialog: CustomSearchDialog,
      }}
    >
      <DocsLayout {...DOCS_LAYOUT_PROPS}>
        {/* Neutral light from the top right (the old image was a blue glow). */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-[-1] bg-[radial-gradient(ellipse_55%_45%_at_100%_0%,color-mix(in_oklab,var(--color-foreground)_7%,transparent),transparent)]"
        />
        {children}
      </DocsLayout>
    </RootProvider>
  );
}
