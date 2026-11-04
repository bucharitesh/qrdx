// Every themes tile on the "Made with QRdx" walls scans (support/wall-scan.ts).
// One file per band, so vitest runs them in parallel.
import { describeBandScans } from "./support/wall-scan";

describeBandScans("themes");
