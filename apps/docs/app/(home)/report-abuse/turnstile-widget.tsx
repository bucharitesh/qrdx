"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";

interface Turnstile {
  render: (
    element: HTMLElement,
    options: Record<string, unknown>,
  ) => string | undefined;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
}

// Not a global declaration, so it can't clash with other Turnstile users.
const getTurnstile = () =>
  (window as unknown as { turnstile?: Turnstile }).turnstile;

/**
 * Cloudflare Turnstile challenge; adds the `cf-turnstile-response` field to
 * the surrounding form. Bump `resetKey` after each submission (tokens are
 * single-use).
 */
export function TurnstileWidget({
  siteKey,
  resetKey,
}: {
  siteKey: string;
  resetKey: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  const render = () => {
    const turnstile = getTurnstile();
    if (!(container.current && turnstile) || widgetId.current) return;
    widgetId.current =
      turnstile.render(container.current, {
        sitekey: siteKey,
        theme: "auto",
      }) ?? null;
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: render once per mount
  useEffect(() => {
    render();
    return () => {
      if (widgetId.current) getTurnstile()?.remove(widgetId.current);
      widgetId.current = null;
    };
  }, []);

  useEffect(() => {
    if (resetKey > 0 && widgetId.current) {
      getTurnstile()?.reset(widgetId.current);
    }
  }, [resetKey]);

  return (
    <>
      <Script
        onLoad={render}
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
      />
      <div className="min-h-[65px]" ref={container} />
    </>
  );
}
