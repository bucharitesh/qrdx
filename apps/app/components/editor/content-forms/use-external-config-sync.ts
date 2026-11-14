"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Copies a stored content config into a form's local state only when someone
 * else changed it (smart paste, loading a code). The form reports its own
 * writes with the returned `markWritten`, so typing never echoes back from
 * the store (which used to ping-pong into "Maximum update depth exceeded").
 */
export function useExternalConfigSync<T>(
  stored: T | undefined,
  apply: (value: T) => void,
) {
  const lastWritten = useRef<string | null>(null);
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const storedKey = stored === undefined ? null : JSON.stringify(stored);

  useEffect(() => {
    if (storedKey === null || storedKey === lastWritten.current) return;
    lastWritten.current = storedKey;
    applyRef.current(JSON.parse(storedKey) as T);
  }, [storedKey]);

  return useCallback((written: T) => {
    lastWritten.current = JSON.stringify(written);
  }, []);
}
