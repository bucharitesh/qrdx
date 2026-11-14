import { spawnSync } from "node:child_process";
import {
  rehypeCodeDefaultOptions,
  remarkSteps,
} from "fumadocs-core/mdx-plugins";
import { remarkTypeScriptToJavaScript } from "fumadocs-docgen/remark-ts2js";
import {
  defineConfig,
  defineDocs,
  frontmatterSchema,
  metaSchema,
} from "fumadocs-mdx/config";
import jsonSchema from "fumadocs-mdx/plugins/json-schema";
import lastModified from "fumadocs-mdx/plugins/last-modified";
import { transformerTwoslash } from "fumadocs-twoslash";
import { createFileSystemTypesCache } from "fumadocs-twoslash/cache-fs";
import { remarkAutoTypeTable } from "fumadocs-typescript";
import type { ElementContent } from "hast";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import { z } from "zod";
import { docsIndex } from "./lib/docs-index-plugin";
import { fillFactsDeep } from "./lib/product-facts";
import { remarkNpmStatus } from "./lib/remark-npm-status";
import { remarkProductFacts } from "./lib/remark-product-facts";
// You can customise Zod schemas for frontmatter and `meta.json` here
// see https://fumadocs.dev/docs/mdx/collections
// `.transform(fillFactsDeep)`: frontmatter strings can quote product counts as
// `{facts.bodyPatterns}` (lib/product-facts.ts), filled in at build time.
// The docs' content stays in the main app's folder for now
// (apps/docs/content/docs): the translation scripts and the main app's own
// copy of the docs read it there. The docs site compiles it from there.
export const docs = defineDocs({
  dir: "../docs/content/docs",
  docs: {
    schema: frontmatterSchema
      .extend({
        preview: z.string().optional(),
        index: z.boolean().default(false),
        /**
         * API routes only
         */
        method: z.string().optional(),
        /** API reference pages (fumadocs-openapi, `bun run openapi:generate`) */
        _openapi: z.looseObject({}).optional(),
      })
      .transform(fillFactsDeep),
    // No `postprocess.includeProcessedMarkdown`: each page's Markdown (the
    // .md and llms routes) comes from the docs index (lib/docs-index.ts), so
    // the compiled pages don't carry a copy.
  },
  meta: {
    schema: metaSchema.extend({
      description: z.string().optional(),
    }),
  },
});

// Each page's "last modified" date comes from git. A Docker build has
// neither the git binary nor the .git folder (see .dockerignore), and
// fumadocs fails the whole build when it can't run git, so there the dates
// are left out. The sitemap already handles pages without one.
const hasGit =
  spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
    stdio: "ignore",
  }).status === 0;

export default defineConfig({
  plugins: [
    jsonSchema({
      insert: true,
    }),
    lastModified({
      versionControl: hasGit ? "git" : async () => undefined,
    }),
    // .source/docs.ts, .source/content.ts and the docs index the route
    // handlers read (lib/docs-index.ts), so the build compiles the docs once.
    docsIndex({ collection: "docs" }),
  ],
  mdxOptions: {
    rehypeCodeOptions: {
      lazy: true,
      langs: ["ts", "js", "html", "tsx", "mdx"],
      inline: "tailing-curly-colon",
      themes: {
        // Catppuccin Latte's greens, peaches and pinks are 2.3–3.5:1 on a
        // light code block; GitHub Light Default's code tokens are 4.8–15:1
        // (comments 4.3:1).
        light: "github-light-default",
        dark: "catppuccin-mocha",
      },
      transformers: [
        ...(rehypeCodeDefaultOptions.transformers ?? []),
        transformerTwoslash({
          typesCache: createFileSystemTypesCache(),
        }),
        {
          name: "@shikijs/transformers:remove-notation-escape",
          code(hast) {
            function replace(node: ElementContent): void {
              if (node.type === "text") {
                node.value = node.value.replace("[\\!code", "[!code");
              } else if ("children" in node) {
                for (const child of node.children) {
                  replace(child);
                }
              }
            }

            replace(hast);
            return hast;
          },
        },
      ],
    },
    remarkCodeTabOptions: {
      parseMdx: true,
    },
    remarkNpmOptions: {
      persist: {
        id: "package-manager",
      },
    },
    remarkPlugins: [
      remarkProductFacts,
      remarkNpmStatus,
      remarkSteps,
      // "$12 vs $15" in prose is prices, not inline math; use $$…$$ for math.
      [remarkMath, { singleDollarTextMath: false }],
      remarkAutoTypeTable,
      remarkTypeScriptToJavaScript,
    ],
    rehypePlugins: (v) => [rehypeKatex, ...v],
  },
});
