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
import { gitFileDate } from "./lib/seo-dates";
// You can customise Zod schemas for frontmatter and `meta.json` here
// see https://fumadocs.dev/docs/mdx/collections
// `.transform(fillFactsDeep)`: frontmatter strings can quote product counts as
// `{facts.bodyPatterns}` (lib/product-facts.ts), filled in at build time.
export const docs = defineDocs({
  dir: "content/docs",
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
      /**
       * npm packages this entry releases. While npm's `latest` is behind one
       * of them, the changelog marks the entry "Coming to npm".
       */
      npm: z
        .array(
          z.object({
            name: z.enum(["qrdx", "@qrdx/cli"]),
            version: z.string(),
          }),
        )
        .optional(),
      /**
       * A 16:9 picture (1600×900): a site path such as
       * /changelog/<slug>/cover.webp, or a media key (lib/media.ts). Entries
       * with one show as cards in the app's sidebar and on /changelogs.
       */
      image: z.string().optional(),
      /** The picture in the dark theme */
      imageDark: z.string().optional(),
      /** What the picture shows */
      imageAlt: z.string().optional(),
      /** A clip's media key (/videos/…, served through lib/media.ts) */
      video: z.string().optional(),
      /** "Try it" in the app's modal; an in-app path */
      cta: z
        .object({
          label: z.string().optional(),
          href: z.string().regex(/^\/(?!\/)/, "an in-app path, like /settings"),
        })
        .optional(),
      /**
       * Opens the entry in the app once by itself, for people who joined
       * before it (components/app-shell/whats-new.tsx). One per release.
       */
      announce: z.boolean().optional(),
    }),
  },
});

export const compare = defineDocs({
  dir: "content/compare",
  docs: {
    schema: frontmatterSchema
      .extend({
        competitor: z.string(),
        competitorUrl: z.string(),
        /** Full URL to competitor logo (SVG or PNG); a neutral icon is shown when omitted */
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
        /**
         * "<competitor> alternatives", shown under the hero. QRdx's own row
         * comes from lib/plans.ts and lib/pricing.ts, so it isn't listed;
         * every tool here has a comparison page of its own.
         */
        alternatives: z
          .object({
            heading: z.string(),
            intro: z.string(),
            qrdxBestFor: z.string(),
            tools: z
              .array(
                z.object({
                  name: z.string(),
                  /** Its comparison page, /compare/<slug> */
                  slug: z.string(),
                  bestFor: z.string(),
                  freeTier: z.string(),
                  paidFrom: z.string(),
                  /** The vendor page the free tier and price came from */
                  source: z.url(),
                  /** ISO date that page was checked */
                  lastVerified: z.string(),
                }),
              )
              .min(3)
              .max(5),
          })
          .optional(),
        /** Questions answered on the page, with FAQPage markup */
        faqs: z
          .array(z.object({ question: z.string(), answer: z.string() }))
          .optional(),
      })
      .transform(fillFactsDeep),
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
    schema: frontmatterSchema
      .extend({
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
      })
      .transform(fillFactsDeep),
  },
});

// Customer stories, served at /customers/<customer id>. One file per company
// in lib/customers.ts, named after its id (content/customers/flam.mdx). The
// customer's `published` switch there is the only thing that puts a story
// on the site (lib/content-source.ts).
export const customers = defineDocs({
  dir: "content/customers",
  docs: {
    schema: frontmatterSchema
      .extend({
        date: z.string(),
        /** Last substantive update (YYYY-MM-DD) */
        updated: z.string().optional(),
        tags: z.array(z.string()).optional(),
        /** A site path (e.g. /customers/<id>/cover.svg) */
        image: z.string(),
        imageAlt: z.string().optional(),
      })
      .transform(fillFactsDeep),
  },
});

export default defineConfig({
  plugins: [
    jsonSchema({
      insert: true,
    }),
    // Each page's "last modified" date comes from git, following moves:
    // fumadocs' own git dates count a moved file as changed (gitFileDate).
    // A Docker build has neither the git binary nor the .git folder (see
    // .dockerignore), so there the dates are left out. The sitemap already
    // handles pages without one.
    lastModified({
      versionControl: async (file) => gitFileDate(file),
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
