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
// You can customise Zod schemas for frontmatter and `meta.json` here
// see https://fumadocs.dev/docs/mdx/collections
export const docs = defineDocs({
  dir: "content/docs",
  docs: {
    schema: frontmatterSchema.extend({
      preview: z.string().optional(),
      index: z.boolean().default(false),
      /**
       * API routes only
       */
      method: z.string().optional(),
    }),
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
  meta: {
    schema: metaSchema.extend({
      description: z.string().optional(),
    }),
  },
});

export const legal = defineDocs({
  dir: "content/legal",
});

export const changelog = defineDocs({
  dir: "content/changelog",
  docs: {
    schema: frontmatterSchema.extend({
      date: z.string(),
      tags: z.array(z.string()).optional(),
      version: z.string().optional(),
    }),
  },
});

export const compare = defineDocs({
  dir: "content/compare",
  docs: {
    schema: frontmatterSchema.extend({
      competitor: z.string(),
      competitorUrl: z.string(),
      /** Full URL to competitor logo (SVG or PNG); a monogram is shown when omitted */
      competitorLogo: z.url().optional(),
      /** "generator" = hosted QR tools, "library" = developer packages */
      category: z.enum(["generator", "library"]).default("generator"),
      tagline: z.string(),
      seoTitle: z.string().optional(),
      seoDescription: z.string().optional(),
      /** Competitor pages the facts on this page were checked against */
      sources: z.array(z.url()).default([]),
      /** ISO date the competitor facts were last checked */
      lastVerified: z.string().optional(),
      qrdxPlan: z.string().default("Free · Open Source"),
      competitorPlan: z.string().default("Paid"),
      tableRows: z.array(
        z.object({
          feature: z.string(),
          tooltip: z.string().optional(),
          /** `{ npmVersion: qrdx }` shows the version npm installs today */
          qrdx: z.union([
            z.string(),
            z.boolean(),
            z.object({ npmVersion: z.enum(["qrdx", "@qrdx/cli"]) }),
          ]),
          competitor: z.union([z.string(), z.boolean()]),
        }),
      ),
      featureHighlights: z.array(
        z.object({
          title: z.string(),
          description: z.string(),
        }),
      ),
    }),
  },
});

export const blogCategories = defineDocs({
  dir: "content/blog-categories",
  docs: {
    schema: frontmatterSchema,
  },
});

export const blogAuthors = defineDocs({
  dir: "content/blog-authors",
  docs: {
    schema: frontmatterSchema.extend({
      role: z.string(),
      avatar: z.string(),
      twitter: z.string().optional(),
      linkedin: z.string().optional(),
      github: z.string().optional(),
    }),
  },
});

export const blog = defineDocs({
  dir: "content/blog",
  docs: {
    schema: frontmatterSchema.extend({
      date: z.string(),
      /** Last substantive update (YYYY-MM-DD) */
      updated: z.string().optional(),
      author: z.array(z.string()),
      category: z
        .enum(["Company News", "Engineering", "Education", "Changelog"])
        .default("Company News"),
      tags: z.array(z.string()).optional(),
      /** Absolute URL or site-relative path (e.g. /blog/<slug>/hero.webp) */
      image: z.string(),
      imageAlt: z.string().optional(),
      related: z.array(z.string()).optional(),
      published: z.boolean().default(false),
    }),
  },
});

export default defineConfig({
  plugins: [
    jsonSchema({
      insert: true,
    }),
    lastModified({
      versionControl: "git",
    }),
  ],
  mdxOptions: {
    rehypeCodeOptions: {
      lazy: true,
      langs: ["ts", "js", "html", "tsx", "mdx"],
      inline: "tailing-curly-colon",
      themes: {
        light: "catppuccin-latte",
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
      remarkSteps,
      // "$12 vs $15" in prose is prices, not inline math; use $$…$$ for math.
      [remarkMath, { singleDollarTextMath: false }],
      remarkAutoTypeTable,
      remarkTypeScriptToJavaScript,
    ],
    rehypePlugins: (v) => [rehypeKatex, ...v],
  },
});
