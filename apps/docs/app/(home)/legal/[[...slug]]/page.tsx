import { cn } from "@repo/design-system/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createMetadata } from "@/lib/metadata";
import { legalSource } from "@/lib/source";
import { getMDXComponents } from "@/mdx-components";

export default async function LegalPage(
  props: PageProps<"/legal/[[...slug]]">,
) {
  const params = await props.params;
  const page = legalSource.getPage(params.slug);

  if (!page) {
    notFound();
  }

  const { body: Mdx, lastModified } = page.data;
  // The page tree keeps the order from content/legal/meta.json.
  const pages = legalSource.pageTree.children.flatMap((node) =>
    node.type === "page" ? [node] : [],
  );

  return (
    <div className="container mx-auto grid gap-8 px-6 py-12 md:px-10 md:py-20 lg:max-w-6xl lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-16">
      {/* Sibling legal pages, so a reader is never at a dead end. */}
      <nav aria-label="Legal" className="lg:sticky lg:top-28 lg:self-start">
        <p className="mb-3 hidden text-xs font-medium uppercase tracking-wider text-muted-foreground lg:block">
          Legal
        </p>
        <ul className="flex flex-wrap gap-1 lg:flex-col">
          {pages.map((item) => {
            const active = item.url === page.url;
            return (
              <li key={item.url}>
                <Link
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "block rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                    active && "bg-accent font-medium text-foreground",
                  )}
                  href={item.url}
                >
                  {item.name}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <article className="min-w-0 max-w-3xl">
        <header className="mb-10 flex flex-col gap-2 border-b pb-8">
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
            {page.data.title}
          </h1>
          {lastModified && (
            <p className="text-sm text-muted-foreground">
              Last updated{" "}
              <time dateTime={new Date(lastModified).toISOString()}>
                {new Date(lastModified).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </time>
            </p>
          )}
        </header>

        <div className="prose prose-neutral dark:prose-invert max-w-none">
          <Mdx components={getMDXComponents()} />
        </div>
      </article>
    </div>
  );
}

export async function generateStaticParams() {
  return legalSource.generateParams();
}

export async function generateMetadata(
  props: PageProps<"/legal/[[...slug]]">,
): Promise<Metadata> {
  const params = await props.params;
  const page = legalSource.getPage(params.slug);

  if (!page) {
    notFound();
  }

  return createMetadata({
    title: page.data.title,
    description: page.data.description,
    path: page.url,
  });
}
