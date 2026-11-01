"use client";

import dynamic from "next/dynamic";

/*
 * Route error boundary: anything a page throws lands here instead of a blank
 * screen. Every page ships this boundary, so the screen itself (ASCII art,
 * site config) loads only when it's needed.
 */
const RouteErrorScreen = dynamic(() =>
  import("@/components/route-error-screen").then((m) => m.RouteErrorScreen),
);

export default function RouteError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorScreen {...props} />;
}
