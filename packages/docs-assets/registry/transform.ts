/**
 * Registry sources import docs-only paths (`@/registry/...`) so the docs can
 * render them live. Projects that install a component get the standard
 * shadcn/ui paths instead. Used by the registry build and by the docs code
 * views, so the published JSON and the code on the page always match.
 */
const IMPORT_REWRITES: [RegExp, string][] = [
  [/(["'])@\/registry\/ui\//g, "$1@/components/ui/"],
  [/(["'])@\/registry\/lib\/utils(["'])/g, "$1@/lib/utils$2"],
  [/(["'])@\/registry\/qrdx\//g, "$1@/components/"],
];

export function toConsumerSource(source: string): string {
  return IMPORT_REWRITES.reduce(
    (code, [pattern, replacement]) => code.replace(pattern, replacement),
    source,
  );
}

/** Where the shadcn CLI writes a `registry:component` file. */
export function toTargetPath(sourcePath: string): string {
  return `components/${sourcePath.split("/").pop()}`;
}
