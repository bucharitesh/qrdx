"use client";

import { examples } from "@repo/docs-assets/registry/examples";

export function RegistryExample({ name }: { name: string }) {
  const Example = examples[name];
  if (!Example) {
    return (
      <p className="text-destructive text-sm">
        Example "{name}" is missing from
        packages/docs-assets/registry/examples/index.tsx.
      </p>
    );
  }
  return <Example />;
}
