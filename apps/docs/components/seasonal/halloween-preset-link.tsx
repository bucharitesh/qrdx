"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps, MouseEvent } from "react";
import type { HalloweenPresetId } from "./halloween-presets";

const PLAYGROUND_PATH = "/playground";

// The editor store is loaded on demand so marketing pages don't ship it.
const loadEditorStore = () => import("@/store/editor-store");

async function applyPreset(preset: HalloweenPresetId) {
  const { useQREditorStore } = await loadEditorStore();
  // Persisted to localStorage, so the playground (and a new tab) opens with it.
  useQREditorStore.getState().applyThemePreset(preset);
}

type HalloweenPresetLinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  preset?: HalloweenPresetId;
};

/** Opens the playground with a Halloween preset applied. */
export function HalloweenPresetLink({
  preset = "halloweenPumpkin",
  onClick,
  onPointerEnter,
  onFocus,
  ...props
}: HalloweenPresetLinkProps) {
  const router = useRouter();

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    const sameTab =
      event.button === 0 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey;
    // Same tab: apply first, then navigate. New tab: apply best-effort and let the browser open it.
    if (sameTab) event.preventDefault();
    applyPreset(preset)
      .catch((error: unknown) => {
        console.error("Could not apply the Halloween preset", error);
      })
      .finally(() => {
        if (sameTab) router.push(PLAYGROUND_PATH);
      });
  };

  return (
    <Link
      href={PLAYGROUND_PATH}
      onClick={handleClick}
      onPointerEnter={(event) => {
        onPointerEnter?.(event);
        void loadEditorStore();
      }}
      onFocus={(event) => {
        onFocus?.(event);
        void loadEditorStore();
      }}
      {...props}
    />
  );
}
