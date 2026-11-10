// Shard 1 of 4 of the official frame checks (tests/support/official-frames.ts).
import {
  describeOfficialFrameChecks,
  officialShard,
} from "../support/official-frames";

describeOfficialFrameChecks(officialShard(1, 4));
