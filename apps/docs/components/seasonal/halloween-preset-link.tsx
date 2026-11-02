"use client";

import {
  PresetLink,
  type PresetLinkProps,
} from "@/components/playground/preset-link";

type HalloweenPresetLinkProps = Omit<PresetLinkProps, "preset"> & {
  /** Built-in preset id (Halloween, Christmas or New Year) */
  preset?: string;
};

/** Opens the playground with a seasonal preset applied. */
export function HalloweenPresetLink({
  preset = "halloweenPumpkin",
  ...props
}: HalloweenPresetLinkProps) {
  return <PresetLink preset={preset} {...props} />;
}
