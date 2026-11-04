// Every sample code on the /qr-codes-for/<industry> pages scans.
import { describe } from "vitest";
import { INDUSTRY_CODES } from "@/lib/landing/page-codes";
import { describeScans } from "./scan-support";

describe("industry page codes scan", () => {
  describeScans(Object.values(INDUSTRY_CODES).flat());
});
