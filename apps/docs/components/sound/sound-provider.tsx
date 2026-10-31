"use client";

import { useEffect } from "react";
import { SOUND_EVENT } from "@/lib/sound/emit";
import { soundEngine } from "@/lib/sound/engine";
import { SOUND_PREFS_KEY } from "@/lib/sound/prefs";

/** An error toast this soon after a gesture is the user's failed action. */
const ERROR_WINDOW_MS = 10_000;
const ERROR_TOAST = '[data-sonner-toast][data-type="error"]';

function isUserActivation(event: Event): boolean {
  if (!event.isTrusted) return false;
  const activation = navigator.userActivation;
  if (activation) return activation.isActive;
  // No UserActivation API: a touch pointerdown is not a gesture yet.
  return !(event instanceof PointerEvent && event.pointerType !== "mouse");
}

/**
 * Arms the cue engine while mounted (app/providers.tsx mounts it inside
 * NotOnCustomerPages, so /p, /q, /ended and /scan stay silent). It unlocks
 * audio on the first gesture and plays the cues code asks for with
 * soundEvent(); the only cue it raises itself is "error" for error toasts
 * that follow a user action.
 */
export function SoundProvider() {
  useEffect(() => {
    const disarm = soundEngine.arm();
    let lastGestureAt = Number.NEGATIVE_INFINITY;

    const onGesture = (event: Event) => {
      if (!event.isTrusted) return;
      lastGestureAt = performance.now();
      if (isUserActivation(event)) soundEngine.unlock(event.type !== "keydown");
    };
    const onCue = (event: Event) => {
      soundEngine.play(String((event as CustomEvent<unknown>).detail));
    };
    const onVisibility = () =>
      soundEngine.setHidden(document.visibilityState === "hidden");
    const onStorage = (event: StorageEvent) => {
      if (event.key === SOUND_PREFS_KEY) soundEngine.reloadPrefs();
    };

    const errors = new MutationObserver((records) => {
      if (performance.now() - lastGestureAt > ERROR_WINDOW_MS) return;
      for (const record of records) {
        const nodes =
          record.type === "attributes" ? [record.target] : record.addedNodes;
        for (const node of nodes) {
          if (node instanceof Element && node.matches(ERROR_TOAST)) {
            soundEngine.play("error");
            return;
          }
        }
      }
    });
    const toaster = document.querySelector(
      'section[aria-live][aria-label^="Notifications"]',
    );
    if (toaster) {
      errors.observe(toaster, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["data-type"],
      });
    }

    const capture = { capture: true, passive: true } as const;
    const gestures = ["pointerdown", "pointerup", "keydown", "touchend"];
    for (const type of gestures) {
      document.addEventListener(type, onGesture, capture);
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener(SOUND_EVENT, onCue);
    window.addEventListener("storage", onStorage);
    onVisibility();

    if (process.env.NODE_ENV !== "production") {
      (window as Window & { __qrdxSound?: unknown }).__qrdxSound = soundEngine;
    }

    return () => {
      for (const type of gestures) {
        document.removeEventListener(type, onGesture, capture);
      }
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener(SOUND_EVENT, onCue);
      window.removeEventListener("storage", onStorage);
      errors.disconnect();
      disarm();
    };
  }, []);

  return null;
}
