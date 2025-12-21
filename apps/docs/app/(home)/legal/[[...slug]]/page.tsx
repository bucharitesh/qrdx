import type { Metadata } from "next";
import { notFound } from "next/navigation";
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

  const { body: Mdx } = page.data;

  return (
    <div className="container mx-auto px-4 py-12 md:px-6 md:py-20 lg:max-w-4xl">
      <h1 className="mb-6 text-3xl font-bold">{page.data.title}</h1>
      {page.data.lastModified && (
        <p className="text-muted-foreground mb-8 text-sm">
          Last Updated:{" "}
          {new Date(page.data.lastModified).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      )}

      <div className="prose prose-neutral dark:prose-invert max-w-none">
        <Mdx components={getMDXComponents()} />
      </div>
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

  return {
    title: `${page.data.title} | qrdx`,
    description: page.data.description,
  };
}
