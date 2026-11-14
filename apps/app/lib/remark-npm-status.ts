// <NpmStatus package="qrdx" /> checks npm when the page renders, which the
// static Markdown copy of a page (llms-full.txt, "Copy Markdown") can't do. In
// that copy it becomes a line that stays true: the version the page describes
// and how to see what npm installs.
import { replaceSource } from "fumadocs-core/mdx-plugins/stringifier";
import cliPackage from "../../../packages/cli/package.json";
import qrdxPackage from "../../../packages/qrdx/package.json";

type SourceFile = Parameters<typeof replaceSource>[0];
type SourceNode = Parameters<typeof replaceSource>[1];

interface Node {
  type: string;
  name?: string | null;
  attributes?: { type: string; name?: string; value?: unknown }[];
  children?: Node[];
}

const VERSIONS: Record<string, string> = {
  qrdx: qrdxPackage.version,
  "@qrdx/cli": cliPackage.version,
};

export function remarkNpmStatus() {
  return (tree: Node, file: SourceFile) => {
    const visit = (node: Node) => {
      if (
        (node.type === "mdxJsxFlowElement" ||
          node.type === "mdxJsxTextElement") &&
        node.name === "NpmStatus"
      ) {
        const attribute = (name: string) =>
          node.attributes?.find((a) => a.name === name)?.value;
        const name = String(attribute("package"));
        const version = attribute("version") ?? VERSIONS[name];
        if (typeof version !== "string") {
          throw new Error(`<NpmStatus package="${name}" />: unknown package.`);
        }
        replaceSource(
          file,
          node as unknown as SourceNode,
          `> This page describes ${name} ${version}. Run \`npm view ${name} version\` to see the version npm installs.`,
        );
        return;
      }
      for (const child of node.children ?? []) visit(child);
    };
    visit(tree);
  };
}
