// Turns `{facts.bodyPatterns}` in MDX prose into the number from
// lib/product-facts.ts at build time. The node becomes plain text, and the
// replaceSource() edit carries the number into the processed Markdown
// (llms-full.txt, "Copy Markdown") as well. An unknown name fails the build.
import { replaceSource } from "fumadocs-core/mdx-plugins/stringifier";
import { productFact } from "./product-facts";

type SourceFile = Parameters<typeof replaceSource>[0];
type SourceNode = Parameters<typeof replaceSource>[1];

interface Node {
  type: string;
  value?: string;
  data?: unknown;
  children?: Node[];
}

const FACT = /^\s*facts\.(\w+)\s*$/;

export function remarkProductFacts() {
  return (tree: Node, file: SourceFile) => {
    const visit = (node: Node) => {
      if (node.type === "mdxTextExpression" && node.value) {
        const match = FACT.exec(node.value);
        if (match) {
          const text = String(productFact(match[1]));
          replaceSource(file, node as unknown as SourceNode, text);
          node.type = "text";
          node.value = text;
          delete node.data;
        }
        return;
      }
      if (node.type === "mdxFlowExpression" && node.value?.match(FACT)) {
        throw new Error(
          `{${node.value.trim()}} must sit inside a sentence, not on a line of its own.`,
        );
      }
      for (const child of node.children ?? []) visit(child);
    };
    visit(tree);
  };
}
