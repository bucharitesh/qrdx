"use client";

import type {
  AnalyticsEventName,
  AnalyticsPropsArg,
  EditorSurface,
  QrSource,
} from "@repo/analytics/events";
import { track } from "@repo/analytics/track";
import { type ComponentProps, useEffect, useRef } from "react";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { previousPathname } from "@/lib/navigation-history";
import {
  countsAsBarcode,
  countsAsGenerated,
  editorOpenedProps,
} from "./funnel";

/** Generation counts once the content has settled for this long. */
const SETTLE_MS = 2000;

/**
 * Editor values QRdx sets itself (a dynamic code's short link, after "Make
 * dynamic" or loading a saved code): never a code the visitor generated.
 */
const programmaticContent = new Set<string>();

/** Marks a value about to be put in the editor by QRdx, not typed. */
export function markProgrammaticQrContent(value: string): void {
  programmaticContent.add(value);
}

/**
 * qr_generated for live editors (no Generate button): once per content
 * type per visit, after the visitor changes the content and pauses. Content
 * restored from an earlier visit, or put there by QRdx
 * (markProgrammaticQrContent), doesn't count.
 */
export function useTrackQrGenerated(
  source: QrSource,
  contentType: string,
  content: string | null | undefined,
) {
  const initial = useRef(content);
  const counted = useRef(new Set<string>());
  useEffect(() => {
    if (
      !countsAsGenerated({
        content,
        initial: initial.current,
        contentType,
        counted: counted.current,
        programmatic: programmaticContent,
      })
    ) {
      return;
    }
    const timer = setTimeout(() => {
      counted.current.add(contentType);
      track("qr_generated", { content_type: contentType, source });
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [content, contentType, source]);
}

/**
 * editor_opened, once per mount of an editor (the funnel's first step),
 * with where the visit came from. `enabled` false sends nothing (the
 * dashboard's copy of an editor).
 */
export function useTrackEditorOpened(surface: EditorSurface, enabled = true) {
  const sent = useRef(false);
  useEffect(() => {
    if (!enabled || sent.current) return;
    sent.current = true;
    try {
      track(
        "editor_opened",
        editorOpenedProps(surface, {
          href: window.location.href,
          referrer: document.referrer,
          previousPath: previousPathname(window.location.pathname),
        }),
      );
    } catch {
      // Analytics never breaks the editor.
    }
  }, [surface, enabled]);
}

/**
 * barcode_generated for the live barcode generator: once per symbology per
 * visit, after a barcode other than the page's own renders and the visitor
 * pauses.
 */
export function useTrackBarcodeGenerated(input: {
  source: "generator" | "dashboard";
  symbology: string;
  value: string;
  rendered: boolean;
  initial: { symbology: string; value: string };
}) {
  const { source, symbology, value, rendered } = input;
  const initial = useRef(input.initial);
  const counted = useRef(new Set<string>());
  useEffect(() => {
    if (
      !countsAsBarcode({
        rendered,
        symbology,
        value,
        initial: initial.current,
        counted: counted.current,
      })
    ) {
      return;
    }
    const timer = setTimeout(() => {
      counted.current.add(symbology);
      track("barcode_generated", { symbology, source });
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [source, symbology, value, rendered]);
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

/**
 * A plain <a> that records an event when clicked, for links next/link
 * shouldn't handle: API routes that redirect to another site.
 */
export function TrackedAnchor<E extends AnalyticsEventName>({
  event,
  props,
  href,
  onClick,
  ...rest
}: ComponentProps<"a"> & {
  href: string;
  event: E;
  props?: AnalyticsPropsArg<E>[0];
}) {
  return (
    <a
      {...rest}
      href={href}
      onClick={(clickEvent) => {
        (track as (event: E, props?: unknown) => void)(event, props);
        onClick?.(clickEvent);
      }}
    />
  );
}
