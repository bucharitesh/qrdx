// Scan checks, shard 6 of 6: the sampled frames in a normal run, every frame
// with QRDX_FULL_FRAME_SCAN=1 (scripts/official-frames/sample.mjs).
import { describeOfficialFrameScanShard } from "../support/official-frames";

describeOfficialFrameScanShard(6, 6);
