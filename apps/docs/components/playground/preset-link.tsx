import Link from "next/link";
import type { ComponentProps } from "react";
import { playgroundHref } from "@/lib/playground-links";

export type PresetLinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  /** Built-in preset id (utils/qr-presets.ts) */
  preset: string;
};

/**
 * Opens the playground with a built-in preset applied: /playground?preset=<id>.
 * The editor applies it once (an undoable step) and clears it from the
 * address, so the link works in a new tab, on another device and without
 * JavaScript on this page.
 */
export function PresetLink({ preset, ...props }: PresetLinkProps) {
  return <Link href={playgroundHref({ preset })} {...props} />;
}
