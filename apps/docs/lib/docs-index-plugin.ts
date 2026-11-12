// A fumadocs-mdx plugin (source.config.ts) that keeps the docs' compiled MDX
// out of the route handlers.
//
// `next build` compiles every module once per layer that imports it. The
// docs pages need the compiled MDX; the route handlers (the .md and llms
// routes, search, the sitemap, Open Graph images) only need each page's
// frontmatter, date, search data and Markdown. When they read those from the
// compiled modules too, every docs page in every language is compiled a
// second time, and the build machine runs out of memory as languages are
// added. So, next to fumadocs' own files in .source, this writes:
//
// - docs.ts: the docs collection, compiled (lib/source.ts, for the pages);
// - content.ts: every other collection, compiled (lib/content-source.ts);
// - docs-index/pages.json: each docs page's frontmatter and date, and each
//   meta.json (lib/docs-index.ts, for the route handlers);
// - docs-index/search.json and docs-index/markdown.json: each page's search
//   data and its Markdown, made by the same remark plugins as the compiled
//   pages, without the rehype (code highlighting) and JavaScript steps.
//
// fumadocs' server.ts (every collection at once) is still written, and
// nothing imports it.
//
// Outside `next dev`, a child process writes the index: making it takes a
// few hundred MB of JavaScript heap, and this process is the one Turbopack
// then compiles the app in, which would keep that heap for the whole build.
import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { EmitEntry, Plugin, PluginContext } from "fumadocs-mdx";
import type { DefaultMDXOptions } from "fumadocs-mdx/config";

const NAME = "qrdx:docs-index";
const CONCURRENCY = 8;
/** Set in the child process that writes the index. */
const CHILD_ENV = "QRDX_DOCS_INDEX_CHILD";

type Core = PluginContext["core"];
type Collection = ReturnType<Core["getCollections"]>[number];
type DocsCollection = Extract<Collection, { type: "docs" }>;
type DocCollection = DocsCollection["docs"];

interface IndexedFile {
  type: "page" | "meta";
  /** Relative to the collection's folder: "developers/mcp.es.mdx". */
  path: string;
  /** Relative to the app: "content/docs/developers/mcp.es.mdx". */
  absolutePath: string;
  data: Record<string, unknown>;
}

interface PageText {
  /** The input it was made from, so dev rebuilds redo changed pages only. */
  source: string;
  frontmatter: Record<string, unknown>;
  structuredData: unknown;
  markdown: string;
}

/** posix "a/b.mdx", whatever the platform. */
const slash = (file: string) => file.split(path.sep).join("/");

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort();
}

/**
 * The newest commit date of each file in `dir`, as fumadocs-mdx's
 * `lastModified: true` reads it (loaders/mdx/last-modified.ts).
 */
async function gitTimestamps(
  cwd: string,
  dir: string,
): Promise<Map<string, Date>> {
  const run = promisify(execFile);
  const timestamps = new Map<string, Date>();
  try {
    const root = (
      await run("git", ["rev-parse", "--show-toplevel"], { cwd })
    ).stdout.trim();
    const { stdout } = await run(
      "git",
      [
        "-c",
        "core.quotepath=off",
        "log",
        "--format=commit:%aI",
        "--name-only",
        "--",
        dir,
      ],
      { cwd, maxBuffer: 256 * 1024 * 1024 },
    );
    let date: Date | undefined;
    for (const line of stdout.split("\n")) {
      if (line.startsWith("commit:")) {
        const parsed = new Date(line.slice(7));
        date = Number.isNaN(parsed.getTime()) ? undefined : parsed;
      } else if (line.length > 0 && date) {
        const file = path.join(root, line);
        if (!timestamps.has(file)) timestamps.set(file, date);
      }
    }
  } catch {
    // No git: no dates, as in fumadocs-mdx.
  }
  return timestamps;
}

/** A view of the core that lists only some collections (for index-file). */
function withCollections(core: Core, keep: (c: Collection) => boolean): Core {
  return new Proxy(core, {
    get(target, prop, receiver) {
      if (prop === "getCollections") {
        return () => target.getCollections().filter(keep);
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

/** fumadocs-mdx's server.ts generator, for some of the collections only. */
async function serverIndex(
  core: Core,
  keep: (c: Collection) => boolean,
): Promise<string> {
  const { default: indexFile } = await import(
    "fumadocs-mdx/plugins/index-file"
  );
  const plugin = indexFile({ browser: false, dynamic: false });
  const out = await plugin.emit?.call({
    core: withCollections(core, keep),
  });
  const server = out?.find((entry) => entry.path === "server.ts");
  if (!server) throw new Error(`[${NAME}] fumadocs-mdx wrote no server.ts`);
  return server.content;
}

/**
 * The remark half of fumadocs-mdx's MDX compile (loaders/mdx/build-default.ts):
 * the same parser and remark plugins, then the processed Markdown
 * (`getText("processed")`, remark-llms) and the search data (remark-structure)
 * are taken from the tree. Code highlighting and the JavaScript output, most
 * of a page's compile, are skipped.
 */
async function createTextCompiler(core: Core, collection: DocCollection) {
  const [
    { createProcessor },
    { applyMdxPreset },
    { remarkInclude },
    { remarkLLMs },
  ] = await Promise.all([
    import("@mdx-js/mdx"),
    import("fumadocs-mdx/config"),
    import("fumadocs-core/mdx-plugins/remark-include"),
    import("fumadocs-core/mdx-plugins/remark-llms"),
  ]);
  const global = core.getConfig().global;
  if ("mdxOptions" in collection && collection.mdxOptions) {
    throw new Error(`[${NAME}] per-collection mdxOptions aren't supported`);
  }
  const optionsFn = global.mdxOptions;
  const options =
    typeof optionsFn === "function" ? await optionsFn() : optionsFn;
  if (options && "preset" in options && options.preset === "minimal") {
    throw new Error(`[${NAME}] the minimal MDX preset isn't supported`);
  }
  // Image sizes (remark-image) don't change the Markdown or the search data.
  const preset = await applyMdxPreset({
    ...(options as DefaultMDXOptions | undefined),
    remarkImageOptions: false,
  })("bundler");
  // The Markdown is always made here (the routes need it), with the
  // collection's remark-llms options when it sets some.
  const llms = collection.postprocess?.includeProcessedMarkdown;

  interface Captured {
    frontmatter?: Record<string, unknown>;
    markdown?: string;
    structuredData?: unknown;
  }

  /** Runs where fumadocs' remark-postprocess runs: after every remark plugin. */
  function remarkCapture() {
    return (
      tree: { type: string; children: unknown[] },
      file: {
        data: Record<string, unknown> & { captured?: Captured };
      },
    ) => {
      file.data.frontmatter ??= {};
      const frontmatter = file.data.frontmatter as Record<string, unknown>;
      if (!frontmatter.title) {
        // remark-postprocess: the first # heading is the title.
        const walk = (node: {
          type: string;
          depth?: number;
          value?: string;
          children?: unknown[];
        }): string | undefined => {
          if (node.type === "heading" && node.depth === 1) return text(node);
          for (const child of (node.children ?? []) as (typeof node)[]) {
            const found = walk(child);
            if (found !== undefined) return found;
          }
          return undefined;
        };
        const text = (node: {
          value?: string;
          children?: unknown[];
        }): string =>
          node.children
            ? (node.children as (typeof node)[]).map(text).join("")
            : (node.value ?? "");
        const title = walk(tree);
        if (title !== undefined) frontmatter.title = title;
      }
      remarkLLMs({
        ...(typeof llms === "object" ? llms : {}),
        _data: true,
      })(tree as never, file as never, () => undefined);
      file.data.captured = {
        frontmatter,
        markdown: file.data.markdown as string | undefined,
        structuredData: file.data.structuredData,
      };
      // Nothing after this is needed: hand the rest an empty tree.
      tree.children = [];
    };
  }

  const processors = new Map<string, ReturnType<typeof createProcessor>>();
  function getProcessor(format: "md" | "mdx") {
    let processor = processors.get(format);
    if (!processor) {
      processor = createProcessor({
        ...preset,
        outputFormat: "program",
        development: false,
        remarkPlugins: [
          [remarkInclude, { getProcessor }],
          ...(preset.remarkPlugins ?? []),
          remarkCapture,
        ],
        rehypePlugins: [],
        recmaPlugins: [],
        format,
      });
      processors.set(format, processor);
    }
    return processor;
  }

  return async (
    filePath: string,
    source: string,
  ): Promise<Omit<PageText, "source">> => {
    const { frontmatter } = await import(
      "fumadocs-core/content/md/frontmatter"
    );
    const matter = frontmatter(source);
    const data = await core.transformFrontmatter(
      { collection, filePath, source },
      matter.data as Record<string, unknown>,
    );
    const lines = matter.matter.split("\n").length - 1;
    const file = await getProcessor(
      filePath.endsWith(".mdx") ? "mdx" : "md",
    ).process({
      value: "\n".repeat(lines) + matter.content,
      path: filePath,
      cwd: collection.cwd,
      data: {
        frontmatter: data,
        _compiler: { addDependency: () => undefined },
      },
    });
    const captured = (file.data as { captured?: Captured }).captured;
    if (!captured) throw new Error(`[${NAME}] ${filePath}: nothing captured`);
    if (typeof captured.markdown !== "string") {
      throw new Error(`[${NAME}] ${filePath}: no processed Markdown`);
    }
    return {
      frontmatter: captured.frontmatter ?? data,
      structuredData: captured.structuredData,
      markdown: captured.markdown ?? "",
    };
  };
}

export interface DocsIndexOptions {
  /** The docs collection's name in source.config.ts. */
  collection: string;
}

export function docsIndex({ collection: name }: DocsIndexOptions): Plugin {
  // Pages already turned into text, by path: `next dev` rebuilds the index
  // on every content change, and only the changed pages are redone.
  const texts = new Map<string, PageText>();

  async function buildIndex(core: Core, collection: DocsCollection) {
    const { docs, meta } = collection;
    const compile = await createTextCompiler(core, docs);
    const base = slash(path.relative(process.cwd(), collection.dir));
    const lastModified = docs.lastModified;
    const dates =
      lastModified === true
        ? await gitTimestamps(docs.cwd, docs.dir)
        : new Map<string, Date>();

    const indexOne = async (absolute: string): Promise<IndexedFile | null> => {
      const file = slash(path.relative(collection.dir, absolute));
      const absolutePath = `${base}/${file}`;
      if (docs.hasFile(absolute)) {
        const source = await readFile(absolute, "utf-8");
        let text = texts.get(file);
        if (text?.source !== source) {
          text = { source, ...(await compile(absolute, source)) };
          texts.set(file, text);
        }
        const date =
          typeof lastModified === "function"
            ? await lastModified(absolute)
            : dates.get(absolute);
        return {
          type: "page",
          path: file,
          absolutePath,
          data: {
            ...text.frontmatter,
            ...(date && { lastModified: date.toISOString() }),
          },
        };
      }
      if (!meta.hasFile(absolute)) return null;
      if (!absolute.endsWith(".json")) {
        throw new Error(`[${NAME}] ${absolute}: docs meta files are JSON`);
      }
      const source = await readFile(absolute, "utf-8");
      let data: unknown;
      try {
        data = JSON.parse(source);
      } catch (error) {
        throw new Error(`invalid data in ${absolute}`, { cause: error });
      }
      return {
        type: "meta",
        path: file,
        absolutePath,
        data: (await core.transformMeta(
          { collection: meta, filePath: absolute, source },
          data,
        )) as Record<string, unknown>,
      };
    };

    // A few at a time: the type tables wait on TypeScript.
    const all = await listFiles(collection.dir);
    const out: (IndexedFile | null)[] = new Array(all.length).fill(null);
    let next = 0;
    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        while (next < all.length) {
          const i = next++;
          out[i] = await indexOne(all[i] as string);
        }
      }),
    );

    const files = out.filter((file): file is IndexedFile => file !== null);
    const search: Record<string, unknown> = {};
    const markdown: Record<string, string> = {};
    for (const file of files) {
      if (file.type !== "page") continue;
      const text = texts.get(file.path) as PageText;
      search[file.path] = text.structuredData;
      markdown[file.path] = text.markdown;
    }
    const seen = new Set(files.map((file) => file.path));
    for (const file of texts.keys()) if (!seen.has(file)) texts.delete(file);
    return { files, search, markdown };
  }

  return {
    name: NAME,
    async emit(): Promise<EmitEntry[]> {
      const core = this.core;
      const collection = core.getCollection(name);
      if (collection?.type !== "docs") {
        throw new Error(`[${NAME}] no docs collection named "${name}"`);
      }
      const isDocs = (c: Collection) => c.name === name;
      const modules: EmitEntry[] = [
        { path: "docs.ts", content: await serverIndex(core, isDocs) },
        {
          path: "content.ts",
          content: await serverIndex(core, (c) => !isDocs(c)),
        },
      ];
      // `bun install` runs fumadocs-mdx too. The modules are enough there
      // (type checks, tests); the index is for the app, which writes it
      // again when `next dev` or `next build` starts.
      if (process.env.npm_lifecycle_event === "postinstall") return modules;
      if (
        process.env.NODE_ENV !== "development" &&
        process.env[CHILD_ENV] !== "1"
      ) {
        // fumadocs-mdx's own command, in a child process: it emits every
        // plugin's files again (the same content), this one with the index.
        const bin = fileURLToPath(import.meta.resolve("fumadocs-mdx/bin"));
        await promisify(execFile)(
          process.execPath,
          [
            bin,
            path.relative(process.cwd(), core.configPath),
            path.relative(process.cwd(), core.outDir),
          ],
          {
            cwd: process.cwd(),
            env: { ...process.env, [CHILD_ENV]: "1" },
            maxBuffer: 64 * 1024 * 1024,
          },
        );
        return modules;
      }
      const index = await buildIndex(core, collection);
      return [
        ...modules,
        {
          path: "docs-index/pages.json",
          content: JSON.stringify({ files: index.files }),
        },
        {
          path: "docs-index/search.json",
          content: JSON.stringify(index.search),
        },
        {
          path: "docs-index/markdown.json",
          content: JSON.stringify(index.markdown),
        },
      ];
    },
    configureServer(server) {
      // `next dev`: rebuild on content changes (fumadocs only rewrites its
      // own index when files are added or removed).
      const watcher = server.watcher;
      if (!watcher) return;
      const collection = this.core.getCollection(name);
      if (collection?.type !== "docs") return;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let running: Promise<unknown> = Promise.resolve();
      watcher.on("all", (_event, file) => {
        if (!collection.hasFile(path.resolve(file))) return;
        clearTimeout(timer);
        timer = setTimeout(() => {
          running = running.then(() =>
            this.core
              .emit({
                filterPlugin: (plugin) => plugin.name === NAME,
                filterWorkspace: () => false,
                write: true,
              })
              .catch((error: unknown) => {
                console.error(
                  `[${NAME}] failed to rebuild the docs index`,
                  error,
                );
              }),
          );
        }, 200);
      });
    },
  };
}
