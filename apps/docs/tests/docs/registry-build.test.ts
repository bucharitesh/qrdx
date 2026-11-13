// The shadcn/ui registry served at /r/<name>.json is the committed
// public/r, which `bun run --filter docs registry:build` writes from the
// registry sources in packages/docs-assets. It must match them: same files,
// same JSON.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isCurrent, registryOutputs } from "@repo/docs-assets/registry/outputs";
import { describe, expect, it } from "vitest";

const PACKAGE = join(import.meta.dirname, "../../../../packages/docs-assets");
const PUBLIC_R = join(import.meta.dirname, "../../public/r");
const outputs = registryOutputs(PACKAGE);

describe("public/r (run `bun run --filter docs registry:build`)", () => {
  it("has one file per registry item, plus the index", () => {
    expect(readdirSync(PUBLIC_R).sort()).toEqual([...outputs.keys()].sort());
    expect(outputs.size).toBeGreaterThan(1);
  });

  it.each([...outputs])("%s is what the build writes", (name, data) => {
    const written = readFileSync(join(PUBLIC_R, name), "utf8");
    expect(isCurrent(written, data)).toBe(true);
  });
});
