// Every sample code on the /qr-code-generator/<type> pages scans.
import { describe } from "vitest";
import { TYPE_CODES } from "@/lib/landing/page-codes";
import { describeScans } from "./scan-support";

describe("generator page codes scan", () => {
  describeScans(Object.values(TYPE_CODES).flat());
});
