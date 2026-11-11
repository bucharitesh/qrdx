"use client";

import { authClient } from "@repo/auth/client";
import { toast } from "@repo/design-system";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAvailability } from "@/components/availability-provider";
import { openPlaygroundBuilder } from "@/components/code-builder/in-place";
import { useDynamicLinkStore } from "@/components/editor/dynamic-link-toggle";
import { track } from "@/lib/analytics";
import { isUntrackedAnalyticsPath } from "@/lib/analytics/privacy";
import { loadOfficialFrame, peekOfficialFrame } from "@/lib/frames/library";
import { previousPathname } from "@/lib/navigation-history";
import { applyPlaygroundParams, SIGNED_IN_TYPES } from "@/lib/playground-apply";
import {
  DYNAMIC_OPEN_TARGET,
  handoffSource,
  hasOneShotParams,
  parsePlaygroundParams,
  resolveControlTab,
  stripOneShotParams,
} from "@/lib/playground-links";
import { officialFrameIdOfStyleParam } from "@/lib/playground-style";
import { useAuthStore } from "@/store/auth-store";
import { useQREditorStore } from "@/store/editor-store";
import { useThemePresetStore } from "@/store/theme-preset-store";
import { getPresetLabel } from "@/utils/qr-presets-helper";

const hasHydrated = () => useQREditorStore.persist?.hasHydrated?.() ?? true;

/**
 * The page a link into the playground was on: the previous page in this tab
 * after an in-app navigation (document.referrer still names the page the
 * visit started on), else document.referrer. Pages analytics never records
 * (the scanner, customer pages) aren't named here either.
 */
function handoffReferrer(origin: string): string {
  const previous = previousPathname(window.location.pathname);
  return previous && !isUntrackedAnalyticsPath(previous)
    ? new URL(previous, origin).href
    : document.referrer;
}

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
  const { has } = useAvailability();
  const aiAvailable = has("aiThemes");
  const aiArtAvailable = has("aiArt");
  const [hydrated, setHydrated] = useState(hasHydrated);
  // The address last handled, so each link applies once (React's dev mode
  // runs effects twice).
  const handled = useRef<string | null>(null);
  const failedFrames = useRef(new Set<string>());
  const [settled, setSettled] = useState(false);
  // Changes to these re-read window.location: a new link to the open page.
  const searchKey = useSearchParams().toString();
  const [hashKey, setHashKey] = useState("");
  // Bumped when an official frame a link names has loaded
  const [framesLoaded, setFramesLoaded] = useState(0);

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

  // biome-ignore lint/correctness/useExhaustiveDependencies: searchKey, hashKey and framesLoaded only signal a new address or a loaded frame; the address is read from window.location
  useEffect(() => {
    if (!hydrated) return;
    const { search, hash, href, origin } = window.location;
    if (handled.current === href) return;
    const params = parsePlaygroundParams(search, hash);

    // A tab alias, or Generate where AI is off, is rewritten to the tab shown;
    // so is a tab the link implies without naming it (section=art: Art).
    const rawTab =
      new URLSearchParams(hash.replace(/^#/, "")).get("tab") ??
      new URLSearchParams(search).get("tab");
    const shownTab =
      params.tab === "ai" && !aiAvailable ? "customisations" : params.tab;
    const tabNeedsRewrite = rawTab !== (shownTab ?? null);

    if (!(hasOneShotParams(params) || tabNeedsRewrite)) {
      handled.current = href;
      setSettled(true);
      return;
    }
    // Dub and Drive types depend on the session; wait until it's known.
    if (params.type && SIGNED_IN_TYPES.has(params.type) && sessionPending) {
      return;
    }
    // open=dynamic asks for sign-in when signed out; wait until that's known.
    if (params.open === DYNAMIC_OPEN_TARGET && sessionPending) return;
    // A shared design names an official frame by id: load its spec first
    // (the frame library loads on demand, lib/frames/library.ts).
    const officialFrame = themePath
      ? null
      : officialFrameIdOfStyleParam(params.style);
    if (officialFrame && !peekOfficialFrame(officialFrame)) {
      loadOfficialFrame(officialFrame)
        .catch(() => undefined)
        .then((frame) => {
          // An unknown id (or a failed load) decodes to no design, as before
          if (!frame) failedFrames.current.add(officialFrame);
          setFramesLoaded((count) => count + 1);
        });
      if (!failedFrames.current.has(officialFrame)) return;
    }
    handled.current = href;

    const presets = useThemePresetStore.getState();
    const outcome = applyPlaygroundParams(params, {
      themePath,
      signedIn: Boolean(session?.user),
      aiAvailable,
      aiArtAvailable,
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
      // open=dynamic: the builder over the editor, or sign-in first.
      codeBuilder: {
        userId: session?.user?.id ?? null,
        open: openPlaygroundBuilder,
        signIn: (intent) =>
          useAuthStore
            .getState()
            .openAuthDialog("signin", "OPEN_CODE_BUILDER", intent),
      },
    });

    const keepTab =
      outcome.tab ?? (rawTab !== null ? resolveControlTab(rawTab) : undefined);
    const stripped = stripOneShotParams(href, keepTab ?? null);
    handled.current = new URL(stripped, href).href;
    window.history.replaceState(null, "", stripped);
    setSettled(true);

    const trackHandoff = (applied: string[]) => {
      if (applied.length === 0) return;
      track("playground_handoff", {
        source: handoffSource(
          handoffReferrer(origin),
          origin,
          new URLSearchParams(search).get("ref"),
        ),
        target: applied.join("+"),
      });
    };
    // A link's AI art style is applied once the style catalogue loads.
    if (outcome.artStyle) {
      void outcome.artStyle.then((applied) =>
        trackHandoff(
          applied ? [...outcome.applied, "artStyle"] : outcome.applied,
        ),
      );
    } else {
      trackHandoff(outcome.applied);
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
    if (outcome.notice) {
      toast("This code can't be dynamic", { description: outcome.notice });
    }
  }, [
    hydrated,
    sessionPending,
    session,
    aiAvailable,
    aiArtAvailable,
    themePath,
    searchKey,
    hashKey,
    framesLoaded,
  ]);

  return { settled };
}
