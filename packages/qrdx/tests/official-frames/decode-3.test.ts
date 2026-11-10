// Shard 3 of 12 of the official frame scan checks (tests/support/official-frames.ts).
import {
  describeOfficialFrameDecoding,
  officialShard,
} from "../support/official-frames";

describeOfficialFrameDecoding(officialShard(3, 12));
