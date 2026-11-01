"use client";

import Link from "next/link";
import { type ComponentProps, useEffect, useRef } from "react";
import type { AnalyticsEventName, AnalyticsPropsArg, QrSource } from "./events";
import { track } from "./track";

/** Generation counts once the content has settled for this long. */
const SETTLE_MS = 2000;

/**
 * qr_generated for live editors (no Generate button): once per content
 * type per visit, after the visitor changes the content and pauses. Content
 * restored from an earlier visit doesn't count.
 */
export function useTrackQrGenerated(
  source: QrSource,
  contentType: string,
  content: string | null | undefined,
) {
  const initial = useRef(content);
  const counted = useRef(new Set<string>());
  useEffect(() => {
    if (!content?.trim() || content === initial.current) return;
    if (counted.current.has(contentType)) return;
    const timer = setTimeout(() => {
      counted.current.add(contentType);
      track("qr_generated", { content_type: contentType, source });
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [content, contentType, source]);
}

/** Sends one event when mounted, for server-rendered pages (404s). */
export function TrackOnMount<E extends AnalyticsEventName>({
  event,
  props,
}: {
  event: E;
  props?: AnalyticsPropsArg<E>[0];
}) {
  const sent = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per mount.
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    (track as (event: E, props?: unknown) => void)(event, props);
  }, []);
  return null;
}

/** A link that records an event when clicked (for server components). */
export function TrackedLink<E extends AnalyticsEventName>({
  event,
  props,
  onClick,
  ...rest
}: ComponentProps<typeof Link> & {
  event: E;
  props?: AnalyticsPropsArg<E>[0];
}) {
  return (
    <Link
      {...rest}
      onClick={(clickEvent) => {
        (track as (event: E, props?: unknown) => void)(event, props);
        onClick?.(clickEvent);
      }}
    />
  );
}
