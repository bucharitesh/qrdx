"use client";

import { examples } from "@/registry/examples";

export function RegistryExample({ name }: { name: string }) {
  const Example = examples[name];
  if (!Example) {
    return (
      <p className="text-destructive text-sm">
        Example "{name}" is missing from registry/examples/index.tsx.
      </p>
    );
  }
  return <Example />;
}
