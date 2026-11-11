// Every official frame, half 1 of 2: spec, colors, layout, a crisp decode
// (tests/support/official-frames.ts).
import {
  describeOfficialFrameBasics,
  officialShard,
} from "../support/official-frames";

describeOfficialFrameBasics(officialShard(1, 2));
