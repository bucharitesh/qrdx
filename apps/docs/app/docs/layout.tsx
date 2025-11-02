import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { baseOptions, linkItems, logo } from "@/lib/layout.shared";
import { source } from "@/lib/source";
import "katex/dist/katex.min.css";

export default function Layout({ children }: LayoutProps<"/docs">) {
  const base = baseOptions();

  return (
    <DocsLayout
      {...base}
      tree={source.pageTree}
      // just icon items
      links={linkItems.filter((item) => item.type === "icon")}
      nav={{
        ...base.nav,
        title: (
          <>
            {logo}
            <span className="font-medium in-[.uwu]:hidden max-md:hidden">
              qrdx
            </span>
          </>
        ),
      }}
    >
      {children}
    </DocsLayout>
  );
}
