import { readFile } from "node:fs/promises";
import path from "node:path";
import { SHADCN_REGISTRY_URL } from "@repo/config";
import { toConsumerSource } from "@repo/docs-assets/registry/transform";
import registry from "@repo/docs-assets/registry.json";

export interface RegistryItem {
  name: string;
  title: string;
  description: string;
  dependencies?: string[];
  registryDependencies?: string[];
  files: { path: string; type: string }[];
}

const items = registry.items as RegistryItem[];

export const REGISTRY_URL = SHADCN_REGISTRY_URL;

export function getRegistryItem(name: string): RegistryItem {
  const item = items.find((entry) => entry.name === name);
  if (!item) throw new Error(`Unknown registry item "${name}".`);
  return item;
}

export function getRegistryItems(): RegistryItem[] {
  return items;
}

const REGISTRY_PREFIX = "registry/";

/**
 * Reads a file under packages/docs-assets/registry (at build time) the way a
 * shadcn/ui project sees it, with `@/registry/...` imports rewritten.
 *
 * The path segments are literals so Turbopack traces only that folder; a
 * fully dynamic path made it trace (and deploy) the whole project.
 */
export async function readRegistrySource(relativePath: string) {
  const inRegistry = relativePath.startsWith(REGISTRY_PREFIX)
    ? relativePath.slice(REGISTRY_PREFIX.length)
    : null;
  if (!inRegistry || inRegistry.split("/").includes("..")) {
    throw new Error(
      `Registry source must be under registry/: "${relativePath}"`,
    );
  }
  const source = await readFile(
    path.join(
      process.cwd(),
      "..",
      "..",
      "packages",
      "docs-assets",
      "registry",
      inRegistry,
    ),
    "utf8",
  );
  return toConsumerSource(source);
}
