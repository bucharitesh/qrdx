/**
 * The shadcn/ui registry served at https://qrdx.dev/r/<name>.json, built from
 * registry.json: one item per component with its source inlined (imports
 * rewritten for shadcn/ui projects), plus the registry index.
 *
 * Written by build.ts; apps/docs/tests/docs/registry-build.test.ts holds the
 * app's committed copy (apps/docs/public/r) to it.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { toConsumerSource } from "./transform";

interface RegistryFile {
  path: string;
  type: string;
  content?: string;
}

interface RegistryItem {
  name: string;
  files: RegistryFile[];
  [key: string]: unknown;
}

/**
 * Each published file's JSON, keyed by file name (`registry.json`,
 * `qr-code.json`, ...). `root` is this package's folder: item file paths in
 * registry.json are relative to it.
 */
export function registryOutputs(root: string): Map<string, unknown> {
  const registry = JSON.parse(
    readFileSync(path.join(root, "registry.json"), "utf8"),
  ) as { items: RegistryItem[] };

  const outputs = new Map<string, unknown>();
  outputs.set("registry.json", registry);

  for (const item of registry.items) {
    outputs.set(`${item.name}.json`, {
      $schema: "https://ui.shadcn.com/schema/registry-item.json",
      ...item,
      files: item.files.map((file) => ({
        ...file,
        content: toConsumerSource(
          readFileSync(path.join(root, file.path), "utf8"),
        ),
      })),
    });
  }

  return outputs;
}

/** Whether a written file holds this data (formatting aside). */
export function isCurrent(written: string | null, data: unknown): boolean {
  return (
    written !== null &&
    JSON.stringify(JSON.parse(written)) === JSON.stringify(data)
  );
}
