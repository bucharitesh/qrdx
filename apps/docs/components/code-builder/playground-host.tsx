"use client";

import { authClient } from "@repo/auth/client";
import { toast } from "@repo/design-system";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useEffectEvent, useState } from "react";
import { useAvailability } from "@/components/availability-provider";
import { usePostLoginAction } from "@/lib/hooks/use-post-login-action";
import {
  currentBuilderRequest,
  currentPageGalleryRequest,
  openPlaygroundBuilder,
} from "./in-place";
import { pageTypeOffered, resumableIntent } from "./playground-request";
import { useCodeBuilderHostSlot, useCodeBuilderStore } from "./store";

// The builder, its pickers and the page gallery load the first time the
// playground asks for one, so /playground's first load stays as it was.
const CodeBuilderSurfaces = dynamic(
  () => import("./code-builder-host").then((mod) => mod.CodeBuilderSurfaces),
  { ssr: false },
);

/**
 * The playground's code builder host (components/editor.tsx mounts it). It
 * registers as a host right away, loads the builder on the first request,
 * and picks up "Make it dynamic…" or a hosted page picked while signed out
 * (the OPEN_CODE_BUILDER post-login action) once the session is back.
 * The playground has no workspace in its URL, so the builder's server
 * actions save to the session's workspace: the one last opened.
 */
export function PlaygroundCodeBuilder() {
  const active = useCodeBuilderHostSlot();
  const requested = useCodeBuilderStore((state) => state.request !== null);
  const [loaded, setLoaded] = useState(false);
  if (requested && !loaded) setLoaded(true);

  const { data: session } = authClient.useSession();
  const userId = session?.user?.id ?? null;
  const fileStorage = useAvailability().has("fileStorage");
  const [resume, setResume] = useState<unknown>(null);

  usePostLoginAction(
    "OPEN_CODE_BUILDER",
    useCallback((data?: unknown) => setResume(data ?? null), []),
  );
  const runResume = useEffectEvent((signedInAs: string) => {
    const intent = resumableIntent(resume);
    setResume(null);
    if (!intent) return;
    if (intent.kind === "page") {
      const type =
        intent.type && pageTypeOffered(intent.type, fileStorage)
          ? intent.type
          : null;
      openPlaygroundBuilder(currentPageGalleryRequest({ type }));
      return;
    }
    const next = currentBuilderRequest(signedInAs);
    if (next.ok) openPlaygroundBuilder(next.request);
    else toast(next.reason);
  });
  useEffect(() => {
    if (resume && userId) runResume(userId);
  }, [resume, userId]);

  if (!(active && loaded)) return null;
  // No shell data here: the builder shows no "n of 10 codes" hint.
  return <CodeBuilderSurfaces usage={null} />;
}
