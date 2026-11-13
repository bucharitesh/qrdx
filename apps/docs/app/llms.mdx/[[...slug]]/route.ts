import { notFound } from "next/navigation";
import { docsIndex } from "@/lib/docs-index";
import { getLLMText } from "@/lib/get-llm-text";
import { buildTimeParams } from "@/lib/static-params";

export const revalidate = false;

/**
 * One docs page as Markdown, for "Copy Markdown", "View as Markdown" and
 * agents: /docs/<path>.md, /docs/<path>.mdx, /docs.md and /docs.mdx are
 * rewritten here in next.config.ts, and so is /docs/<path> when the request
 * asks for text/markdown.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug?: string[] }> },
) {
  const { slug } = await params;
  // /docs/x.md asked for as text/markdown arrives here as x.md.
  const last = slug?.at(-1)?.replace(/\.mdx?$/, "");
  const page = docsIndex().getPage(
    slug && last !== undefined ? [...slug.slice(0, -1), last] : slug,
  );
  if (!page) notFound();

  return new Response(await getLLMText(page), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}

// Unknown pages answer notFound() above (lib/static-params.ts).
export function generateStaticParams() {
  return buildTimeParams(() => docsIndex().generateParams());
}
