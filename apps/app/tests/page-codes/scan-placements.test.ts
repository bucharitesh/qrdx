// Every sample code on the /qr-codes-on/<placement> pages scans.
import { describe, vi } from "vitest";
import { PLACEMENT_CODES } from "@/lib/landing/page-codes";
import { describeScans } from "./scan-support";

// Each test decodes rendered codes, which is CPU-bound: under a heavily loaded
// machine (many test runs at once) a test can pass 30 s. The limit is raised
// for this file only; nothing it checks changes.
vi.setConfig({ testTimeout: 120_000 });

describe("placement page codes scan", () => {
  describeScans(Object.values(PLACEMENT_CODES).flat());
});
