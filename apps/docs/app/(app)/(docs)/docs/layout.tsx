import type { DocsLayoutProps } from "fumadocs-ui/layouts/docs";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { docsTabs, filterPageTree } from "@/lib/docs-tree";
import { isPathAvailable } from "@/lib/feature-availability";
import { baseOptions, linkItems, logo } from "@/lib/layout.shared";
import { source } from "@/lib/source";
import "katex/dist/katex.min.css";
import { RootProvider } from "fumadocs-ui/provider/base";
import CustomSearchDialog from "@/components/search";
import { JsonLd } from "@/components/sections/tools/json-ld";
import { organizationSchema } from "@/lib/seo-schema";

// No sidebar entry for docs of features this deployment can't offer.
const tree = filterPageTree(source.pageTree, isPathAvailable);

const DOCS_LAYOUT_PROPS: DocsLayoutProps = {
  tree,
  // Help, Guides, Developers, React library and Self-hosting: tabs above
  // the page on desktop, a switcher in the mobile menu (lib/docs-tree.ts).
  tabs: docsTabs(tree),
  tabMode: "top",
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
        <JsonLd data={organizationSchema} />
        {/* Neutral light from the top right (the old image was a blue glow).
            Light mode needs half the ink, or it reads as a grey smudge. */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-[-1] bg-[radial-gradient(ellipse_55%_45%_at_100%_0%,color-mix(in_oklab,var(--color-foreground)_3.5%,transparent),transparent)] dark:bg-[radial-gradient(ellipse_55%_45%_at_100%_0%,color-mix(in_oklab,var(--color-foreground)_7%,transparent),transparent)]"
        />
        {children}
      </DocsLayout>
    </RootProvider>
  );
}
