import Link from "fumadocs-core/link";
import { PathUtils } from "fumadocs-core/source";
import * as Twoslash from "fumadocs-twoslash/ui";
import { createGenerator } from "fumadocs-typescript";
import { AutoTypeTable } from "fumadocs-typescript/ui";
import { Callout } from "fumadocs-ui/components/callout";
import { TypeTable } from "fumadocs-ui/components/type-table";
import { DocsPage } from "fumadocs-ui/page";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ComponentProps, FC, ReactNode } from "react";
import { Mermaid } from "@/components/mdx/mermaid";
import { NotFound } from "@/components/not-found";
import * as Preview from "@/components/preview";
import { Wrapper } from "@/components/preview/wrapper";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { getPageImage, source } from "@/lib/source";
import { getMDXComponents } from "@/mdx-components";

function PreviewRenderer({ preview }: { preview: string }): ReactNode {
  if (preview && preview in Preview) {
    const Comp = Preview[preview as keyof typeof Preview];
    return <Comp />;
  }

  return null;
}

export const revalidate = false;

const generator = createGenerator();

export default async function Page(props: PageProps<"/docs/[[...slug]]">) {
  const params = await props.params;
  const page = source.getPage(params.slug);

  if (!page) return <NotFound getSuggestions={() => Promise.resolve([])} />;

  const { body: Mdx, toc, preview } = page.data;

  return (
    <DocsPage
      toc={toc}
      tableOfContent={{
        style: "clerk",
      }}
    >
      <div className="prose flex-1 text-fd-foreground/90">
        {preview ? <PreviewRenderer preview={preview} /> : null}
        <Mdx
          components={getMDXComponents({
            ...Twoslash,
            a: ({ href, ...props }) => {
              const found = source.getPageByHref(href ?? "", {
                dir: PathUtils.dirname(page.path),
              });

              if (!found) return <Link href={href} {...props} />;

              return (
                <HoverCard>
                  <HoverCardTrigger
                    href={
                      found.hash
                        ? `${found.page.url}#${found.hash}`
                        : found.page.url
                    }
                    {...props}
                  >
                    {props.children}
                  </HoverCardTrigger>
                  <HoverCardContent className="text-sm">
                    <p className="font-medium">{found.page.data.title}</p>
                    <p className="text-fd-muted-foreground">
                      {found.page.data.description}
                    </p>
                  </HoverCardContent>
                </HoverCard>
              );
            },
            Mermaid,
            TypeTable,
            AutoTypeTable: (props) => (
              <AutoTypeTable generator={generator} {...props} />
            ),
            Wrapper,
            blockquote: Callout as unknown as FC<ComponentProps<"blockquote">>,
          })}
        />
      </div>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return await source.generateParams();
}

export async function generateMetadata(
  props: PageProps<"/docs/[[...slug]]">,
): Promise<Metadata> {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) {
    notFound();
  }

  return {
    title: page.data.title,
    description: page.data.description,
    openGraph: {
      images: getPageImage(page).url,
    },
  };
}
