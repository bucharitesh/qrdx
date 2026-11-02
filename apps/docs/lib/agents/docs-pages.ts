import "server-only";

import type { Node } from "fumadocs-core/page-tree";
import { filterPageTree } from "@/lib/docs-tree";
import { isPathAvailable } from "@/lib/feature-availability";
import { type Page, source } from "@/lib/source";

/** A docs tab (Help, Guides, Developers, …) and its pages, in sidebar order. */
export interface DocsSection {
  /** The tab's title; "" for pages outside every tab, like /docs itself. */
  title: string;
  pages: Page[];
}

const nodeName = (node: { name: unknown }) =>
  typeof node.name === "string" ? node.name : "";

/**
 * Every docs page this deployment offers, grouped by tab in the sidebar's
 * order (content/docs meta.json), so llms.txt and llms-full.txt read like the
 * docs do. Pages no sidebar lists come last, in their own group.
 */
export function docsSections(): DocsSection[] {
  const tree = filterPageTree(source.pageTree, isPathAvailable);
  const byUrl = new Map(source.getPages().map((page) => [page.url, page]));
  const seen = new Set<string>();
  const take = (url: string | undefined, into: Page[]) => {
    const page = url ? byUrl.get(url) : undefined;
    if (!page || seen.has(page.url)) return;
    seen.add(page.url);
    into.push(page);
  };
  const walk = (nodes: Node[], into: Page[]) => {
    for (const node of nodes) {
      if (node.type === "page") take(node.url, into);
      else if (node.type === "folder") {
        take(node.index?.url, into);
        walk(node.children, into);
      }
    }
  };

  const sections: DocsSection[] = [{ title: "", pages: [] }];
  for (const node of tree.children) {
    if (node.type === "folder" && node.root) {
      const section: DocsSection = { title: nodeName(node), pages: [] };
      take(node.index?.url, section.pages);
      walk(node.children, section.pages);
      sections.push(section);
    } else {
      walk([node], sections[0].pages);
    }
  }
  const rest = [...byUrl.values()].filter(
    (page) => !seen.has(page.url) && isPathAvailable(page.url),
  );
  if (rest.length > 0) sections.push({ title: "More", pages: rest });
  return sections.filter((section) => section.pages.length > 0);
}
