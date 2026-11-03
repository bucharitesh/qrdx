"use client";

import { authClient } from "@repo/auth/client";
import { toast } from "@repo/design-system";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAvailability } from "@/components/availability-provider";
import { useDynamicLinkStore } from "@/components/editor/dynamic-link-toggle";
import { track } from "@/lib/analytics";
import { applyPlaygroundParams, SIGNED_IN_TYPES } from "@/lib/playground-apply";
import {
  handoffSource,
  hasOneShotParams,
  parsePlaygroundParams,
  resolveControlTab,
  stripOneShotParams,
} from "@/lib/playground-links";
import { useQREditorStore } from "@/store/editor-store";
import { useThemePresetStore } from "@/store/theme-preset-store";
import { getPresetLabel } from "@/utils/qr-presets-helper";

const hasHydrated = () => useQREditorStore.persist?.hasHydrated?.() ?? true;

/**
 * Applies a playground link's parameters (lib/playground-links.ts) once, in
 * the browser after the editor's saved state has loaded, then removes the
 * one-shot ones from the address bar, so a reload never overwrites later
 * edits. /playground stays a static page. A later link to the open
 * playground (a new query or `#`) is applied the same way.
 *
 * Returns `settled`: false until the first address has been handled. The
 * editor keeps its loading shell up until then, so the content forms mount
 * with the link's values instead of writing their old ones back over them.
 *
 * `themePath`: the page is /playground/<themeId>, whose theme is the look.
 */
export function usePlaygroundParams({ themePath }: { themePath: boolean }): {
  settled: boolean;
} {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const aiAvailable = useAvailability().has("aiThemes");
  const [hydrated, setHydrated] = useState(hasHydrated);
  // The address last handled, so each link applies once (React's dev mode
  // runs effects twice).
  const handled = useRef<string | null>(null);
  const [settled, setSettled] = useState(false);
  // Changes to these re-read window.location: a new link to the open page.
  const searchKey = useSearchParams().toString();
  const [hashKey, setHashKey] = useState("");

  useEffect(() => {
    const update = () => setHashKey(window.location.hash);
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);

  useEffect(() => {
    if (hydrated) return;
    if (hasHydrated()) {
      setHydrated(true);
      return;
    }
    return useQREditorStore.persist?.onFinishHydration?.(() =>
      setHydrated(true),
    );
  }, [hydrated]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: searchKey and hashKey only signal a new address; it is read from window.location
  useEffect(() => {
    if (!hydrated) return;
    const { search, hash, href, origin } = window.location;
    if (handled.current === href) return;
    const params = parsePlaygroundParams(search, hash);

    // A tab alias, or Generate where AI is off, is rewritten to the tab shown.
    const rawTab =
      new URLSearchParams(hash.replace(/^#/, "")).get("tab") ??
      new URLSearchParams(search).get("tab");
    const shownTab =
      params.tab === "ai" && !aiAvailable ? "customisations" : params.tab;
    const tabNeedsRewrite = rawTab !== null && rawTab !== (shownTab ?? null);

    if (!(hasOneShotParams(params) || tabNeedsRewrite)) {
      handled.current = href;
      setSettled(true);
      return;
    }
    // Dub and Drive types depend on the session; wait until it's known.
    if (params.type && SIGNED_IN_TYPES.has(params.type) && sessionPending) {
      return;
    }
    handled.current = href;

    const presets = useThemePresetStore.getState();
    const outcome = applyPlaygroundParams(params, {
      themePath,
      signedIn: Boolean(session?.user),
      aiAvailable,
      isBuiltInPreset: (id) => {
        const preset = presets.getPreset(id);
        return Boolean(preset) && preset?.source !== "SAVED";
      },
      presetLabel: getPresetLabel,
      dynamicLink: {
        get: () => useDynamicLinkStore.getState().code,
        unlink: () => useDynamicLinkStore.getState().unlink(),
        link: (code) => useDynamicLinkStore.getState().link(code),
      },
    });

    const keepTab =
      outcome.tab ?? (rawTab !== null ? resolveControlTab(rawTab) : undefined);
    const stripped = stripOneShotParams(href, keepTab ?? null);
    handled.current = new URL(stripped, href).href;
    window.history.replaceState(null, "", stripped);
    setSettled(true);

    if (outcome.applied.length > 0) {
      track("playground_handoff", {
        source: handoffSource(
          document.referrer,
          origin,
          new URLSearchParams(search).get("ref"),
        ),
        target: outcome.applied.join("+"),
      });
    }
    if (outcome.applied.includes("preset") && params.preset) {
      track("theme_applied", { method: "preset", preset: params.preset });
    }
    if (outcome.replaced && outcome.message) {
      toast(outcome.message, {
        action: { label: "Undo", onClick: outcome.undo },
      });
    } else if (outcome.needsContent) {
      toast("Add your content first, then download it.");
    }
  }, [
    hydrated,
    sessionPending,
    session,
    aiAvailable,
    themePath,
    searchKey,
    hashKey,
  ]);

  return { settled };
}
