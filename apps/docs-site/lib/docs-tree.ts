import type { Node, Root } from "fumadocs-core/page-tree";
import { getSidebarTabs } from "fumadocs-ui/components/sidebar/tabs";
import type { LayoutTab } from "fumadocs-ui/layouts/shared";

/**
 * The docs tabs (Help, Guides, Developers, React library, Self-hosting): one
 * per `"root": true` folder in content/docs. Guides, React library and
 * Self-hosting are `(group)` folders whose meta.json lists pages that live
 * one level up (`../page`), so those pages keep their old URLs.
 *
 * Each tab carries the URLs of its pages instead of a link to its folder
 * node, so the tab bar also shows on /docs itself (outside every tab), and a
 * page is in the tab whose sidebar lists it.
 */
export function docsTabs(tree: Root): LayoutTab[] {
  return getSidebarTabs(tree).filter((tab) => !tab.unlisted);
}

/**
 * The docs sidebar without pages `keep` rejects (pages for features this
 * deployment can't offer, lib/feature-availability-rules.ts). Folders left
 * empty, and their index if it's rejected, go too.
 */
export function filterPageTree(
  root: Root,
  keep: (url: string) => boolean,
): Root {
  const visit = (nodes: Node[]): Node[] =>
    nodes.flatMap((node): Node[] => {
      if (node.type === "page") return keep(node.url) ? [node] : [];
      if (node.type !== "folder") return [node];
      const index = node.index && keep(node.index.url) ? node.index : undefined;
      const children = visit(node.children);
      if (!index && children.length === 0) return [];
      return [{ ...node, index, children }];
    });
  return { ...root, children: visit(root.children) };
}

/**
 * The sidebar with each link to a page outside the docs (meta.json items
 * like `[Changelog](/changelogs)`) passed through `map`: in another
 * language, the link opens that page's translation where one exists.
 */
export function mapLinkNodes(root: Root, map: (url: string) => string): Root {
  const visit = (nodes: Node[]): Node[] =>
    nodes.map((node): Node => {
      if (node.type === "page") {
        return node.$ref ? node : { ...node, url: map(node.url) };
      }
      if (node.type !== "folder") return node;
      return { ...node, children: visit(node.children) };
    });
  return { ...root, children: visit(root.children) };
}
