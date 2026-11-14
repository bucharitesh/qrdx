// Routes that give client components a reduced message catalog
// (lib/i18n/playground.ts) must list every namespace those components read.
// A missing one renders raw keys, e.g. "app.dashboard.codes.slugField.…" in
// the code builder on /playground. This follows the imports from each
// route's files and collects the useTranslations("…") namespaces of every
// client module it reaches.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_FLOW_NAMESPACES,
  DASHBOARD_NAMESPACES,
  PLAYGROUND_NAMESPACES,
  SETTINGS_NAMESPACES,
} from "@/lib/i18n/playground";

const APP = join(import.meta.dirname, "../..");

const EXTENSIONS = [
  "",
  ".tsx",
  ".ts",
  ".jsx",
  ".js",
  "/index.tsx",
  "/index.ts",
];
const IMPORT =
  /(?:import|export)\s+(type\s+)?(?:[^"';]*?\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
const NAMESPACE = /useTranslations\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
const directive = (name: string) =>
  new RegExp(
    String.raw`^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use ${name}["']`,
  );
const USE_CLIENT = directive("client");
const USE_SERVER = directive("server");

function resolveImport(from: string, spec: string) {
  let base: string;
  if (spec.startsWith("@/")) {
    base = join(APP, spec.slice(2));
  } else if (spec.startsWith(".")) {
    base = resolve(dirname(from), spec);
  } else {
    return;
  }
  for (const extension of EXTENSIONS) {
    const path = base + extension;
    if (existsSync(path) && statSync(path).isFile()) {
      return path;
    }
  }
}

interface ModuleInfo {
  client: boolean;
  imports: string[];
  namespaces: string[];
  server: boolean;
}
const modules = new Map<string, ModuleInfo>();
function read(file: string): ModuleInfo {
  const cached = modules.get(file);
  if (cached) {
    return cached;
  }
  const source = readFileSync(file, "utf8");
  const imports: string[] = [];
  for (const match of source.matchAll(IMPORT)) {
    if (match[1]) {
      continue; // type-only
    }
    const path = resolveImport(file, match[2] ?? match[3] ?? "");
    if (path) {
      imports.push(path);
    }
  }
  const info = {
    client: USE_CLIENT.test(source),
    server: USE_SERVER.test(source),
    imports,
    namespaces: [...source.matchAll(NAMESPACE)].map((m) => m[1] ?? ""),
  };
  modules.set(file, info);
  return info;
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return filesUnder(path);
    }
    return /\.(tsx?|jsx?)$/.test(name) && !name.includes(".test.")
      ? [path]
      : [];
  });
}

/** Namespace → a client file that reads it, for everything under `dirs`. */
function clientNamespaces(dirs: string[]) {
  const found = new Map<string, string>();
  const seen = new Set<string>();
  const queue = dirs
    .map((dir) => join(APP, dir))
    .filter((dir) => existsSync(dir))
    .flatMap(filesUnder)
    .map((file) => ({ file, client: false }));
  while (queue.length > 0) {
    const next = queue.shift();
    if (!next) {
      break;
    }
    const key = `${next.file}|${next.client}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const info = read(next.file);
    // A client module importing a server action gets an RPC reference.
    if (next.client && info.server) {
      continue;
    }
    const client = next.client || info.client;
    if (client) {
      for (const namespace of info.namespaces) {
        if (!found.has(namespace)) {
          found.set(namespace, relative(APP, next.file));
        }
      }
    }
    for (const file of info.imports) {
      queue.push({ file, client });
    }
  }
  return found;
}

const provided = (namespace: string, list: readonly string[]) =>
  list.some(
    (entry) => namespace === entry || namespace.startsWith(`${entry}.`),
  );

/**
 * Namespaces a client component reads only part of, where the route lists
 * exactly the keys it uses.
 */
const PARTIAL: Record<string, string> = {
  // components/landing/page-footer.tsx reads hosted.madeWithQrdx and
  // reportAbuse only.
  scanPages: "scanPages.reportAbuse",
};

// The sign-in pages are left out: their server modules import client
// components (hosted-page blocks) that they never render.
const ROUTES: [string, string[], readonly string[]][] = [
  [
    "/playground",
    ["app/[lang]/playground", "app/(app)/playground"],
    PLAYGROUND_NAMESPACES,
  ],
  ["/dashboard", ["app/(app)/dashboard"], DASHBOARD_NAMESPACES],
  ["/settings", ["app/(app)/settings"], SETTINGS_NAMESPACES],
  [
    "/invite, /join, /oauth",
    ["app/(app)/invite", "app/(app)/join", "app/(app)/oauth"],
    ACCOUNT_FLOW_NAMESPACES,
  ],
];

describe("client message namespaces", () => {
  it.each(ROUTES)(
    "%s lists every namespace its client components read",
    (_, dirs, list) => {
      const found = clientNamespaces(dirs);
      expect(found.size).toBeGreaterThan(10);
      const missing = [...found]
        .filter(([namespace]) => {
          if (provided(namespace, list)) {
            return false;
          }
          const partial = PARTIAL[namespace];
          return !(partial && list.includes(partial as never));
        })
        .map(([namespace, file]) => `${namespace} (${file})`);
      expect(missing).toEqual([]);
    },
  );
});
