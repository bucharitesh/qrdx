// Every sample code on the /qr-codes-on/<placement> pages scans.
import { describe } from "vitest";
import { PLACEMENT_CODES } from "@/lib/landing/page-codes";
import { describeScans } from "./scan-support";

describe("placement page codes scan", () => {
  describeScans(Object.values(PLACEMENT_CODES).flat());
});
