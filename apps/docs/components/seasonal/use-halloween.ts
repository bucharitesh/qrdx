"use client";

import { useEffect, useState } from "react";
import { getClientSeason } from "@/lib/seasonal";

/** localStorage flag set by "Hide Halloween" (hides the bar and every character). */
export const HALLOWEEN_HIDDEN_KEY = "qrdx:halloween-2026:hidden";
const CHANGE_EVENT = "qrdx:halloween-change";

export function isHalloweenHidden(): boolean {
  try {
    return window.localStorage.getItem(HALLOWEEN_HIDDEN_KEY) !== null;
  } catch {
    return false;
  }
}

export function hideHalloween() {
  try {
    window.localStorage.setItem(HALLOWEEN_HIDDEN_KEY, "1");
  } catch {
    // Blocked storage: hidden for this page view only.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function isHalloweenOn() {
  return getClientSeason() === "halloween" && !isHalloweenHidden();
}

/** Halloween is running and the visitor hasn't hidden it. False on the server and first render. */
export function useHalloweenOn(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const update = () => setOn(isHalloweenOn());
    update();
    window.addEventListener(CHANGE_EVENT, update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(CHANGE_EVENT, update);
      window.removeEventListener("storage", update);
    };
  }, []);
  return on;
}

export function subscribeHalloween(update: () => void) {
  window.addEventListener(CHANGE_EVENT, update);
  window.addEventListener("storage", update);
  return () => {
    window.removeEventListener(CHANGE_EVENT, update);
    window.removeEventListener("storage", update);
  };
}

export { isHalloweenOn };

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}
