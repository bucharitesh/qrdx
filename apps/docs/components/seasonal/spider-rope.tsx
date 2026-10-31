"use client";

import { type Anchor, HangingCharacter } from "./rope";
import styles from "./seasonal.module.css";

export type { Anchor };

/** Halloween spider on its silk: drops when the cursor comes near, spins up on click. */
export function SpiderRope({
  stage,
  anchor,
  rest,
  width = 22,
}: {
  stage: HTMLElement;
  anchor: Anchor;
  rest: number;
  width?: number;
}) {
  return (
    <HangingCharacter
      stage={stage}
      anchor={anchor}
      rest={rest}
      sprite="spider"
      width={width}
      // The render is 243×512 with its silk to the top edge; the legs start ~34% down.
      ratio={512 / 243}
      visible={0.7}
      className={`${styles.wiggle} drop-shadow-[0_2px_3px_rgb(0_0_0/0.35)] dark:drop-shadow-[0_0_3px_rgb(255_255_255/0.3)]`}
    />
  );
}
