// The rate limits copy quotes (@repo/config limits.ts) are the ones the
// routes enforce. The routes build their limiters inline, so this reads
// their source rather than importing them (which would need Redis).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DESIGN_QR_REQUESTS_PER_MINUTE,
  MCP_REQUESTS_PER_MINUTE,
  QR_IMAGE_REQUESTS_PER_MINUTE,
} from "@repo/config";
import { describe, expect, it } from "vitest";
import { PRODUCT_FACTS } from "@/lib/product-facts";

const APP = join(import.meta.dirname, "../..");
const source = (file: string) => readFileSync(join(APP, file), "utf8");

describe("public API rate limits", () => {
  it.each([
    ["app/api/v1/qr/route.ts", QR_IMAGE_REQUESTS_PER_MINUTE],
    ["app/api/mcp/route.ts", MCP_REQUESTS_PER_MINUTE],
    ["app/api/mcp/tools.ts", DESIGN_QR_REQUESTS_PER_MINUTE],
  ])("%s limits to %i a minute", (file, perMinute) => {
    expect(source(file)).toContain(`slidingWindow(${perMinute}, "60 s")`);
  });

  it("the docs quote the same numbers", () => {
    expect(PRODUCT_FACTS.imageApiPerMinute).toBe(QR_IMAGE_REQUESTS_PER_MINUTE);
    expect(source("content/docs/developers/image-api.mdx")).toContain(
      `${QR_IMAGE_REQUESTS_PER_MINUTE} requests per minute per IP address`,
    );
    expect(source("content/docs/developers/mcp.mdx")).toContain(
      `${DESIGN_QR_REQUESTS_PER_MINUTE} calls per minute per IP address`,
    );
  });
});
