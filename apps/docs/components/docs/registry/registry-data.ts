import { readFile } from "node:fs/promises";
import path from "node:path";
import { toConsumerSource } from "@/registry/transform";
import registry from "@/registry.json";

export interface RegistryItem {
  name: string;
  title: string;
  description: string;
  dependencies?: string[];
  registryDependencies?: string[];
  files: { path: string; type: string }[];
}

const items = registry.items as RegistryItem[];

export const REGISTRY_URL = "https://qrdx.dev/r";

export function getRegistryItem(name: string): RegistryItem {
  const item = items.find((entry) => entry.name === name);
  if (!item) throw new Error(`Unknown registry item "${name}".`);
  return item;
}

export function getRegistryItems(): RegistryItem[] {
  return items;
}

/**
 * Reads a file under apps/docs (at build time) the way a shadcn/ui project
 * sees it, with `@/registry/...` imports rewritten.
 */
export async function readRegistrySource(relativePath: string) {
  const source = await readFile(path.join(process.cwd(), relativePath), "utf8");
  return toConsumerSource(source);
}
